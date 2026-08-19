from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
from pydantic import BaseModel

from services import retrieval, audio

# Define the State Schema
class GraphState(TypedDict):
    raw_transcript: str
    stt_confidence: float
    cleaned_query: str
    retrieved_docs: List[Dict[str, Any]]
    final_answer: str
    citations: List[Dict[str, Any]]
    status: str  # "success", "needs_validation", "rejected_guardrail"
    reprompt_message: Optional[str]
    hallucination_retries: int

llm = ChatOpenAI(model="gpt-4o", temperature=0)
fast_llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# --- Nodes ---

def clean_disfluencies_node(state: GraphState):
    """Normalizes Hinglish and disfluencies"""
    cleaned = audio.clean_disfluencies(state["raw_transcript"])
    return {"cleaned_query": cleaned}

def intent_validator_node(state: GraphState):
    """Human-in-the-Loop node. If confidence is low, it pauses execution."""
    # This node doesn't strictly DO anything if confidence is high.
    # If confidence is low, the router logic will interrupt BEFORE this node finishes,
    # or we handle it in the router. LangGraph uses `interrupt_before` in compilation.
    pass

def input_guardrail_node(state: GraphState):
    """Checks if query is malicious or off-topic BEFORE retrieval."""
    prompt = PromptTemplate.from_template(
        "Is this query malicious, harmful, or completely off-topic for a standard knowledge base? "
        "Query: '{query}'\nAnswer strictly YES or NO."
    )
    result = (prompt | fast_llm).invoke({"query": state["cleaned_query"]}).content.strip().upper()
    
    if "YES" in result:
        return {"status": "rejected_guardrail", "final_answer": "I cannot fulfill this request as it violates safety guardrails."}
    return {"status": "processing"}

def retrieve_node(state: GraphState):
    """Hybrid Retrieval from MSMARCO-XI chunks"""
    docs = retrieval.hybrid_search(state["cleaned_query"], top_k=5)
    return {"retrieved_docs": docs}

def generate_node(state: GraphState):
    """Generates the answer using strict inline citations."""
    docs = state["retrieved_docs"]
    if not docs:
        return {"final_answer": "I could not find any relevant information.", "citations": []}
        
    context_str = ""
    citations = []
    for i, doc in enumerate(docs):
        doc_id = doc.get("metadata", {}).get("doc_id", f"doc_{i}")
        citations.append({
            "id": doc_id,
            "content": doc.get("content", "")[:200] + "..." # snippet
        })
        context_str += f"[{doc_id}]: {doc.get('content', '')}\n\n"

    prompt = PromptTemplate.from_template(
        "Answer the question based ONLY on the context. You MUST use inline citations like [doc_id].\n"
        "Context:\n{context}\n\nQuestion: {query}\nAnswer:"
    )
    
    answer = (prompt | llm).invoke({
        "context": context_str,
        "query": state["cleaned_query"]
    }).content
    
    return {"final_answer": answer, "citations": citations}

def hallucination_guardrail_node(state: GraphState):
    """Checks if the generated answer is grounded in the retrieved documents."""
    prompt = PromptTemplate.from_template(
        "Does this answer contain facts NOT present in the context? "
        "Context: {context}\nAnswer: {answer}\n"
        "Reply STRICTLY 'YES' (it contains hallucinations) or 'NO' (it is fully grounded)."
    )
    context_str = str(state["retrieved_docs"])
    result = (prompt | fast_llm).invoke({"context": context_str, "answer": state["final_answer"]}).content.strip().upper()
    
    if "YES" in result:
        # Hallucination detected
        return {"hallucination_retries": state.get("hallucination_retries", 0) + 1}
    return {"status": "success"}

# --- Edges & Routing ---

def route_after_cleaning(state: GraphState):
    if state["stt_confidence"] < 0.7:
        return "human_validation"
    return "input_guardrail"

def route_after_input_guardrail(state: GraphState):
    if state["status"] == "rejected_guardrail":
        return END
    return "retrieve"

def route_after_hallucination_check(state: GraphState):
    if state["status"] == "success":
        return END
    if state.get("hallucination_retries", 0) >= 2:
        # We tried twice, it's still hallucinating. Bail out with best-effort answer.
        return END
    return "generate" # Retry generation

# --- Build Graph ---

workflow = StateGraph(GraphState)

workflow.add_node("clean_disfluencies", clean_disfluencies_node)
workflow.add_node("intent_validator", intent_validator_node)
workflow.add_node("input_guardrail", input_guardrail_node)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("generate", generate_node)
workflow.add_node("hallucination_guardrail", hallucination_guardrail_node)

workflow.set_entry_point("clean_disfluencies")

workflow.add_conditional_edges(
    "clean_disfluencies",
    route_after_cleaning,
    {"human_validation": "intent_validator", "input_guardrail": "input_guardrail"}
)

workflow.add_edge("intent_validator", "input_guardrail")

workflow.add_conditional_edges(
    "input_guardrail",
    route_after_input_guardrail,
    {END: END, "retrieve": "retrieve"}
)

workflow.add_edge("retrieve", "generate")
workflow.add_edge("generate", "hallucination_guardrail")

workflow.add_conditional_edges(
    "hallucination_guardrail",
    route_after_hallucination_check,
    {END: END, "generate": "generate"}
)

# Compile with memory so we can pause at intent_validator
memory = MemorySaver()
rag_app = workflow.compile(checkpointer=memory, interrupt_before=["intent_validator"])

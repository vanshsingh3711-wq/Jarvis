from typing import TypedDict, List, Dict, Any, Optional, Annotated
import operator
import json
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
    chat_history: Annotated[List[Dict[str, str]], operator.add]

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
fast_llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# --- Nodes ---

def clean_disfluencies_node(state: GraphState):
    """Normalizes Hinglish and disfluencies — skips LLM for clean transcripts"""
    raw = state["raw_transcript"].strip()
    # Skip expensive LLM call for short clean transcripts
    filler_words = {"umm", "uh", "um", "like", "you know", "so like", "basically"}
    words = raw.lower().split()
    has_fillers = any(f in raw.lower() for f in filler_words)
    if len(words) <= 15 and not has_fillers:
        return {"cleaned_query": raw}
    cleaned = audio.clean_disfluencies(raw, state.get("chat_history", []))
    return {"cleaned_query": cleaned}

def intent_validator_node(state: GraphState):
    """Human-in-the-Loop node. If confidence is low, it pauses execution."""
    # This node doesn't strictly DO anything if confidence is high.
    # If confidence is low, the router logic will interrupt BEFORE this node finishes,
    # or we handle it in the router. LangGraph uses `interrupt_before` in compilation.
    pass

def intent_routing_node(state: GraphState):
    """Checks if query is malicious, off-topic, or just casual conversation."""
    
    history_str = ""
    if state.get("chat_history"):
        # Only take the last 4 messages to avoid blowing up context for routing
        recent = state["chat_history"][-4:]
        history_str = "Recent Chat History:\n" + "\n".join([f"{msg['role']}: {msg['content']}" for msg in recent]) + "\n\n"

    prompt = PromptTemplate.from_template(
        "You are an intent router for a conversational AI.\n"
        "{history}"
        "User Query: '{query}'\n\n"
        "Classify the query into one of these categories:\n"
        "1. NOT_DIRECTED_TO_ASSISTANT: if the user is clearly talking to someone else in the room and not the AI.\n"
        "2. UNSAFE: if it is harmful, malicious, or inappropriate.\n"
        "3. COMMAND: if the user is giving an instruction to the AI itself (e.g., 'shut up', 'stop', 'wait', 'pause').\n"
        "4. CASUAL_CONVERSATION: if it is small talk, greetings ('hey', 'hello', 'what's up', 'how are you', 'hi jarvis'), or general knowledge that does NOT require searching a specific database.\n"
        "5. RAG_QUERY: if it requires searching the knowledge base (e.g., asking about specific policies, documents, or technical facts).\n\n"
        "If the category is CASUAL_CONVERSATION, you MUST also provide a conversational answer to the query in the exact same language as the user. This bypasses retrieval for ultra-fast response. Use the chat history to maintain context if they are continuing a previous thought.\n"
        "If the category is COMMAND, you MUST provide a very short acknowledgement (e.g., 'Okay', 'Stopping').\n"
        "Output your response strictly as a JSON object with keys 'intent' (string) and 'answer' (string, empty if not CASUAL/COMMAND)."
    )
    
    fast_llm_json = ChatOpenAI(model="gpt-4o-mini", temperature=0, model_kwargs={"response_format": {"type": "json_object"}})
    result = (prompt | fast_llm_json).invoke({
        "query": state["cleaned_query"],
        "history": history_str
    }).content
    
    try:
        data = json.loads(result)
        intent = data.get("intent", "RAG").upper()
        answer = data.get("answer", "")
    except Exception:
        intent = "RAG"
        answer = ""
        
    if intent == "NOT_DIRECTED_TO_ASSISTANT":
        # Silently drop the request
        return {"status": "fast_reply", "final_answer": "", "citations": []}
    elif intent == "UNSAFE":
        return {"status": "rejected_guardrail", "final_answer": "I cannot fulfill this request as it violates safety guardrails."}
    elif intent == "COMMAND":
        # Do not add simple commands to history to avoid cluttering memory
        return {"status": "fast_reply", "final_answer": answer, "citations": []}
    elif intent == "CASUAL_CONVERSATION":
        new_history = [
            {"role": "user", "content": state["cleaned_query"]},
            {"role": "assistant", "content": answer}
        ]
        return {"status": "fast_reply", "final_answer": answer, "chat_history": new_history, "citations": []}
    
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

    history_str = ""
    if state.get("chat_history"):
        history_str = "Chat History:\n" + "\n".join([f"{msg['role']}: {msg['content']}" for msg in state["chat_history"]]) + "\n\n"

    prompt = PromptTemplate.from_template(
        "You are JARVIS, an advanced, highly intelligent AI assistant. "
        "You have perfect memory of our conversation history and you seamlessly use it to understand context. "
        "You always give sharp, accurate, and direct answers without unnecessary filler.\n\n"
        "{history}"
        "Context:\n{context}\n\n"
        "Question: {query}\n\n"
        "Instructions:\n"
        "1. If the context contains the answer, use it and include citations like [doc_id].\n"
        "2. If the context is completely irrelevant to the question, IGNORE the context entirely and just answer the question naturally using your general knowledge and the chat history.\n"
        "3. CRITICAL: You MUST respond in the EXACT SAME LANGUAGE as the user's Question. If the user asks in Hindi, answer in Hindi.\n"
        "Answer:"
    )
    
    answer = (prompt | llm).invoke({
        "history": history_str,
        "context": context_str,
        "query": state["cleaned_query"]
    }).content
    
    # Append the new interaction to the history
    new_history = [
        {"role": "user", "content": state["cleaned_query"]},
        {"role": "assistant", "content": answer}
    ]
    
    return {"final_answer": answer, "citations": citations, "chat_history": new_history}

def hallucination_guardrail_node(state: GraphState):
    """Checks if the generated answer is grounded in the retrieved documents."""
    prompt = PromptTemplate.from_template(
        "Does this answer contain facts NOT present in the context? "
        "Context: {context}\nAnswer: {answer}\n"
        "CRITICAL INSTRUCTION: If the answer is a general knowledge fact, basic math, or a conversational greeting, you MUST reply 'NO'. "
        "You should ONLY reply 'YES' if the user asked a domain-specific question and the answer fabricated domain-specific information not found in the context.\n"
        "Reply STRICTLY 'YES' (it contains hallucinations) or 'NO' (it is fully grounded or general knowledge)."
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
    return "intent_routing"

def route_after_intent(state: GraphState):
    if state["status"] in ["rejected_guardrail", "fast_reply"]:
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
workflow.add_node("intent_routing", intent_routing_node)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("generate", generate_node)
workflow.add_node("hallucination_guardrail", hallucination_guardrail_node)

workflow.set_entry_point("clean_disfluencies")

workflow.add_conditional_edges(
    "clean_disfluencies",
    route_after_cleaning,
    {"human_validation": "intent_validator", "intent_routing": "intent_routing"}
)

workflow.add_edge("intent_validator", "intent_routing")

workflow.add_conditional_edges(
    "intent_routing",
    route_after_intent,
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

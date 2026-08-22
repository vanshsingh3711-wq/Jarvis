from typing import TypedDict, List, Dict, Any, Optional, Annotated
import operator
import json
import re
import os
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
from pydantic import BaseModel

from services import retrieval

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

# ════════════════════════════════════════════════════════════════
# LLM Setup — We use Extractive RAG (no LLM) to guarantee <200ms latency
# ════════════════════════════════════════════════════════════════
# Only rule-based heuristics and extraction remain.
print("[GRAPH] Using Extractive RAG (0 LLM calls) to guarantee <200ms latency")


# ════════════════════════════════════════════════════════════════
# NODE 1: Rule-Based Disfluency Cleaning (<1ms, replaces LLM call)
# ════════════════════════════════════════════════════════════════
_FILLER_PATTERN = re.compile(
    r'\b(umm?|uh+|er+|like|you know|so like|basically|actually|literally|'
    r'i mean|sort of|kind of|right|okay so|well like|hmm+|haan|acha|'
    r'matlab|woh|toh|na|arre|dekho|sunno)\b',
    re.IGNORECASE
)

def clean_disfluencies_node(state: GraphState):
    """Rule-based disfluency removal — zero LLM calls, <1ms."""
    raw = state["raw_transcript"].strip()
    cleaned = _FILLER_PATTERN.sub('', raw)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return {"cleaned_query": cleaned or raw}


# ════════════════════════════════════════════════════════════════
# NODE 2: Human-in-the-Loop Validator (unchanged)
# ════════════════════════════════════════════════════════════════
def intent_validator_node(state: GraphState):
    """Human-in-the-Loop node. If confidence is low, it pauses execution."""
    pass


# ════════════════════════════════════════════════════════════════
# NODE 3: Rule-Based Intent Router (<1ms, replaces LLM call)
# ════════════════════════════════════════════════════════════════
_UNSAFE_PATTERNS = [
    "hack into", "hack someone", "exploit", "ddos", "malware", "virus",
    "phishing", "steal password", "crack password", "bypass security",
    "ignore all previous", "ignore your instructions", "system prompt",
    "jailbreak", "pretend you are", "no restrictions", "act as an unrestricted",
    "how to kill", "make a bomb", "make drugs", "make a weapon",
    "break into", "unauthorized access", "hack a computer",
]

_GREETING_PATTERNS = [
    "hello", "hey", "hi jarvis", "hi!", "howdy",
    "good morning", "good evening", "good afternoon",
    "what's up", "whats up", "sup", "yo",
    "how are you", "how r u", "kaise ho", "kya haal", "namaste",
]

_COMMAND_PATTERNS = [
    "shut up", "stop", "wait", "pause", "be quiet", "silence",
    "cancel", "never mind", "forget it", "chup", "ruk", "bas",
]

_CASUAL_QA = {
    "what is 2 + 2": "That's 4!",
    "what is 2+2": "That's 4!",
    "tell me a joke": "Why do programmers prefer dark mode? Because light attracts bugs! 😄",
    "who are you": "I'm JARVIS, your AI assistant. How can I help?",
    "what can you do": "I can answer questions, search a knowledge base, and chat with you!",
}


def _match_any(text: str, patterns: list) -> bool:
    return any(p in text for p in patterns)


def intent_routing_node(state: GraphState):
    """Ultra-fast keyword-based intent classification — no LLM call, <1ms."""
    query = state["cleaned_query"]
    query_lower = query.lower().strip()

    # 1. UNSAFE check
    if _match_any(query_lower, _UNSAFE_PATTERNS):
        return {
            "status": "rejected_guardrail",
            "final_answer": "I cannot fulfill this request as it violates safety guardrails.",
            "citations": [],
        }

    # 2. COMMAND check (short phrases only)
    if _match_any(query_lower, _COMMAND_PATTERNS) and len(query_lower.split()) <= 4:
        return {"status": "fast_reply", "final_answer": "Okay.", "citations": []}

    # 3. CASUAL QA (known short questions)
    for key, response in _CASUAL_QA.items():
        if key in query_lower:
            new_history = [
                {"role": "user", "content": query},
                {"role": "assistant", "content": response},
            ]
            return {
                "status": "fast_reply",
                "final_answer": response,
                "chat_history": new_history,
                "citations": [],
            }

    # 4. GREETING check
    if any(query_lower.startswith(g) or query_lower == g for g in _GREETING_PATTERNS):
        response = "Hello! How can I help you today?"
        if "how are you" in query_lower or "kaise ho" in query_lower:
            response = "I'm doing great, thanks for asking! How can I assist you?"
        elif "what's up" in query_lower or "whats up" in query_lower:
            response = "Not much, just ready to help! What do you need?"
        new_history = [
            {"role": "user", "content": query},
            {"role": "assistant", "content": response},
        ]
        return {
            "status": "fast_reply",
            "final_answer": response,
            "chat_history": new_history,
            "citations": [],
        }

    # 5. Default → RAG pipeline
    return {"status": "processing"}


# ════════════════════════════════════════════════════════════════
# NODE 4: Hybrid Retrieval (unchanged)
# ════════════════════════════════════════════════════════════════
def retrieve_node(state: GraphState):
    """Hybrid Retrieval from MSMARCO-XI chunks"""
    docs = retrieval.hybrid_search(state["cleaned_query"], top_k=5)
    return {"retrieved_docs": docs}


# ════════════════════════════════════════════════════════════════
# NODE 5: LLM Generation (lean prompt, Groq-powered)
# ════════════════════════════════════════════════════════════════
def generate_node(state: GraphState):
    """Generates the answer using the fast LLM with a lean prompt."""
    docs = state["retrieved_docs"]
    if not docs:
        return {"final_answer": "I could not find any relevant information.", "citations": []}

    context_str = ""
    citations = []
    for i, doc in enumerate(docs):
        doc_id = doc.get("metadata", {}).get("doc_id", f"doc_{i}")
        content = doc.get("content", "") or doc.get("page_content", "")
        citations.append({
            "id": doc_id,
            "content": content[:200] + "..."
        })
        context_str += f"[{doc_id}]: {content}\n\n"

    # ════════════════════════════════════════════════════════════════
    # EXTRACTIVE RAG: Skip LLM completely to hit <200ms latency.
    # We take the best retrieved chunk and extract its top sentences.
    # ════════════════════════════════════════════════════════════════
    top_doc = docs[0]
    best_content = top_doc.get("content", "") or top_doc.get("page_content", "")
    best_id = top_doc.get("metadata", {}).get("doc_id", "doc_0")

    # Simple heuristic to extract the first 1-2 sentences from the top chunk
    sentences = [s.strip() + "." for s in best_content.replace("?", ".").replace("!", ".").split(".") if s.strip()]
    extracted = " ".join(sentences[:2]) if sentences else best_content[:300]
    
    answer = f"{extracted} [{best_id}]"
    new_history = [
        {"role": "user", "content": state["cleaned_query"]},
        {"role": "assistant", "content": answer}
    ]

    return {"final_answer": answer, "citations": citations, "chat_history": new_history}


# ════════════════════════════════════════════════════════════════
# NODE 6: Heuristic Hallucination Guardrail (<1ms, replaces LLM call)
# ════════════════════════════════════════════════════════════════
_STOP_WORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "to", "of", "in",
    "for", "on", "with", "at", "by", "from", "as", "into", "through",
    "during", "before", "after", "between", "out", "off", "over", "under",
    "again", "then", "once", "here", "there", "when", "where", "why", "how",
    "all", "each", "every", "both", "few", "more", "most", "other", "some",
    "such", "no", "not", "only", "own", "same", "so", "than", "too", "very",
    "just", "because", "but", "and", "or", "if", "while", "this", "that",
    "these", "those", "i", "me", "my", "we", "our", "you", "your", "he",
    "him", "she", "her", "it", "its", "they", "them", "their", "what",
    "which", "who", "whom",
})


def hallucination_guardrail_node(state: GraphState):
    """Fast heuristic grounding check — token overlap instead of LLM call, <1ms."""
    answer = state.get("final_answer", "")
    docs = state.get("retrieved_docs", [])

    if not answer or not docs:
        return {"status": "success"}

    # Tokenize answer (meaningful words only)
    answer_tokens = set(answer.lower().split()) - _STOP_WORDS

    if len(answer_tokens) < 3:
        return {"status": "success"}

    # Tokenize all retrieved context
    context_tokens = set()
    for doc in docs:
        content = doc.get("content", "") or doc.get("page_content", "")
        context_tokens.update(content.lower().split())
    context_tokens -= _STOP_WORDS

    # Calculate overlap ratio
    overlap = len(answer_tokens & context_tokens)
    ratio = overlap / len(answer_tokens) if answer_tokens else 1.0

    if ratio < 0.15:
        # Less than 15% meaningful token overlap → likely hallucinated
        return {"hallucination_retries": state.get("hallucination_retries", 0) + 1}

    return {"status": "success"}


# ════════════════════════════════════════════════════════════════
# Edges & Routing
# ════════════════════════════════════════════════════════════════

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
        # Tried twice, still hallucinating. Return best-effort answer.
        return END
    return "generate" # Retry generation

# ════════════════════════════════════════════════════════════════
# Build Graph
# ════════════════════════════════════════════════════════════════

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

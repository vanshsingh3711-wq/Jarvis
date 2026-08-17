import os
from typing import List, Dict, Any, Tuple
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate

# A scripted refusal trigger for the demo
OFF_TOPIC_KEYWORDS = ["ignore all previous instructions", "bomb", "hack", "bypass"]

def generate_answer(query: str, retrieved_docs: List[Dict[str, Any]]) -> Tuple[str, List[Dict[str, Any]], bool]:
    """
    Generates an answer using an LLM, strictly enforcing inline citations.
    Returns (answer_text, citations_list, is_refusal).
    """
    # 1. Scripted Guardrail Refusal
    if any(keyword in query.lower() for keyword in OFF_TOPIC_KEYWORDS):
        return (
            "I cannot fulfill this request. I am a specialized AI designed only to answer questions based on the provided RAG architecture context.",
            [], 
            True
        )
        
    if not retrieved_docs:
        return ("I couldn't find any relevant information to answer your question.", [], False)

    # Prepare context string
    context_str = ""
    citations = []
    for i, doc in enumerate(retrieved_docs):
        doc_id = doc.get("id", f"doc_{i}")
        citations.append({
            "id": doc_id,
            "source": doc.get("metadata", {}).get("source", "unknown"),
            "content": doc.get("content", "")
        })
        context_str += f"[{doc_id}]: {doc.get('content', '')}\n\n"

    prompt = PromptTemplate.from_template(
        "You are an expert AI assistant answering questions based on retrieved context.\n"
        "Rules:\n"
        "1. You MUST ground every claim using the provided context.\n"
        "2. You MUST use inline citations in the format [doc_id] exactly as provided.\n"
        "3. If the context does not contain the answer, say 'I don't know based on the provided context.'\n\n"
        "Context:\n{context}\n\n"
        "Question: {query}\n\n"
        "Answer:"
    )

    try:
        llm = ChatOpenAI(model="gpt-4o", temperature=0)
        chain = prompt | llm
        result = chain.invoke({"context": context_str, "query": query})
        return result.content, citations, False
    except Exception as e:
        print(f"Generation error: {e}")
        return ("An error occurred while generating the answer.", [], False)

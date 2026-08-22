import os
import json
from typing import List, Dict, Any
from rank_bm25 import BM25Okapi

BM25_CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "bm25_corpus.json")

class RetrievalService:
    def __init__(self):
        self.bm25 = None
        self.bm25_corpus = []
        self.load_indexes()

    def load_indexes(self):
        if os.path.exists(BM25_CACHE_PATH):
            with open(BM25_CACHE_PATH, "r") as f:
                self.bm25_corpus = json.load(f)
                tokenized_corpus = [doc["content"].split(" ") for doc in self.bm25_corpus]
                self.bm25 = BM25Okapi(tokenized_corpus)

    def hybrid_search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        # Fallback to BM25 only to guarantee <200ms latency
        if not self.bm25:
            print("Warning: Index not found. Please run ingest_msmarco.py first.")
            return []
            
        tokenized_query = query.split(" ")
        sparse_scores = self.bm25.get_scores(tokenized_query)
        sparse_results = [{"page_content": doc["content"], "metadata": doc["metadata"], "score": float(score)} for doc, score in zip(self.bm25_corpus, sparse_scores)]
        
        # Sort and return
        fused = sorted(sparse_results, key=lambda x: x["score"], reverse=True)
        return fused[:top_k]

# Singleton instance
retriever = RetrievalService()

def hybrid_search(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    return retriever.hybrid_search(query, top_k)

import os
import json
from datasets import load_dataset
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai.embeddings import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma

# Configuration
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chroma_db")
BM25_CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "bm25_corpus.json")

def process_and_ingest():
    print("Loading MSMARCO-XI Dataset (English slice for demo)...")
    # For a hackathon demo, we load a small slice of the validation set to keep ingestion fast
    dataset = load_dataset("ai4bharat/MSMARCO-XI", "default", split="validation[:1000]")
    
    print(f"Loaded {len(dataset)} records. Applying multiple chunking strategies...")
    
    # 1. Semantic Chunker (splits based on meaning shifts)
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    semantic_chunker = SemanticChunker(embeddings, breakpoint_threshold_type="percentile")
    
    # 2. Recursive Character Splitter (fallback with overlap)
    recursive_chunker = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
        separators=["\n\n", "\n", ".", " "]
    )
    
    documents = []
    bm25_corpus = []
    
    for row in dataset:
        doc_id = row.get("id", str(hash(row["passage"])))
        text = row["passage"]
        
        # Apply Metadata-Aware formatting before chunking
        metadata_header = f"Source: MSMARCO | ID: {doc_id} | Language: en\nContent: "
        full_text = metadata_header + text
        
        # We demonstrate multiple chunking strategies.
        # Strategy A: Semantic Chunking (Vast strategy requirement)
        try:
            # Semantic chunking can fail on very short texts
            chunks = semantic_chunker.split_text(full_text)
        except Exception:
            # Strategy B: Recursive chunking fallback
            chunks = recursive_chunker.split_text(full_text)
            
        for i, chunk in enumerate(chunks):
            # Save for Chroma
            documents.append({
                "page_content": chunk,
                "metadata": {"doc_id": doc_id, "chunk_index": i, "strategy": "semantic_or_recursive"}
            })
            
            # Save for BM25 (Hybrid retrieval requirement)
            bm25_corpus.append({
                "id": f"{doc_id}_{i}",
                "content": chunk,
                "metadata": {"doc_id": doc_id, "strategy": "semantic_or_recursive"}
            })

    print(f"Total chunks created: {len(documents)}. Indexing into Vector DB...")
    
    # Ingest into Chroma
    texts = [doc["page_content"] for doc in documents]
    metadatas = [doc["metadata"] for doc in documents]
    
    vectorstore = Chroma.from_texts(
        texts=texts,
        metadatas=metadatas,
        embedding=embeddings,
        persist_directory=CHROMA_PERSIST_DIR
    )
    vectorstore.persist()
    
    # Save corpus for fast BM25 loading later
    with open(BM25_CACHE_PATH, "w") as f:
        json.dump(bm25_corpus, f)
        
    print("Ingestion Complete! Data indexed in ChromaDB and BM25 cache.")

if __name__ == "__main__":
    # Ensure env keys are loaded if testing manually
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
    
    process_and_ingest()

import traceback
from services.graph import workflow

try:
    app = workflow.compile()
    res = app.invoke({'raw_transcript': 'What is the hybrid retrieval strategy?', 'cleaned_query': 'What is the hybrid retrieval strategy?', 'stt_confidence': 0.99})
    print(res)
except Exception as e:
    traceback.print_exc()

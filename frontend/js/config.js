// Keep local development pointed at the local FastAPI server, and use the
// deployed Render API for hosted frontend pages unless explicitly overridden.
const isLocalDocTrace = ["localhost", "127.0.0.1"].includes(window.location.hostname);
window.DOC_TRACE_API_URL = window.DOC_TRACE_API_URL ||
  (isLocalDocTrace ? "http://127.0.0.1:8000" : "https://doctrace-backend.onrender.com");

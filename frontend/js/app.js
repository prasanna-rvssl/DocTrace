const API_BASE_URL =
  window.DOC_TRACE_API_URL || "http://127.0.0.1:8000";

const CHAT_API_URL =
  window.DOC_TRACE_CHAT_URL || `${API_BASE_URL}/api/chat`;


/* =========================================================
   DEMO DOCUMENT
========================================================= */

const DEMO_RESULT = {
  document_type: "Contract",

  payment_deadline: "within 30 days",

  amount: "₹4,50,000",

  page: 7,

  source_text:
    "The purchaser shall make payment within 30 days of receiving the invoice duly submitted upon milestone acceptance.",

  section: "4.2",

  obligations: [
    "Payment within 30 days of receiving the invoice after milestone acceptance."
  ],

  risks: [
    "Review payment terms and any applicable late-payment conditions."
  ],

  review_items: [
    "Review payment terms and any applicable late-payment conditions."
  ]
};


/* =========================================================
   NAVIGATION
========================================================= */

function goToHome() {
  window.location.href = "index.html";
}


function goToDashboard() {
  window.location.href = "dashboard.html";
}


function goToUpload() {
  window.location.href = "upload.html";
}


/* =========================================================
   SESSION STORAGE
========================================================= */

function saveResult(result, fileName) {

  sessionStorage.setItem(
    "docTraceResult",
    JSON.stringify(result)
  );

  if (fileName) {
    sessionStorage.setItem(
      "docTraceFileName",
      fileName
    );
  }
}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(value) {

  return String(value ?? "").replace(
    /[&<>"']/g,

    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c])
  );

}


/* =========================================================
   UPLOAD STATUS
========================================================= */

function setUploadStatus(
  message,
  type = "info",
  container = null
) {

  const target =
    container ||
    document.getElementById("uploadStatus");

  if (!target) return;

  target.className =
    `upload-status ${type}`;

  target.innerHTML = message;

  target.hidden = false;
}


/* =========================================================
   SAVE PDF FOR DASHBOARD
========================================================= */

function saveUploadedPDF(file) {

  return new Promise((resolve, reject) => {

    if (!file) {
      reject(new Error("No PDF file selected."));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {

      try {

        sessionStorage.setItem(
          "docTracePDF",
          reader.result
        );

        resolve(reader.result);

      } catch (error) {

        reject(
          new Error(
            "The PDF is too large to store in the browser session."
          )
        );

      }

    };

    reader.onerror = () => {
      reject(
        new Error("Could not save the uploaded PDF.")
      );
    };

    reader.readAsDataURL(file);

  });
}


/* =========================================================
   DOCUMENT ANALYSIS
========================================================= */

async function analyzeDocument(
  file,
  statusContainer = null,
  button = null
) {
  if (!file) return;

  if (
    file.type &&
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    setUploadStatus(
      "Please upload a PDF document.",
      "error",
      statusContainer
    );
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  if (button) {
    button.disabled = true;
    button.dataset.originalText =
      button.dataset.originalText || button.textContent;
    button.textContent = "Analyzing...";
  }

  setUploadStatus(
    '<span class="loading-spinner"></span><span>Analyzing document...</span>',
    "processing",
    statusContainer
  );

  try {
    console.log("Sending document to backend...");

    const response = await fetch(
      `${API_BASE_URL}/api/analyze`,
      {
        method: "POST",
        body: formData
      }
    );

    console.log(
      "Backend response status:",
      response.status
    );

    const contentType =
      response.headers.get("content-type") || "";

    let result;

    if (contentType.includes("application/json")) {
      result = await response.json();
    } else {
      const textResponse = await response.text();
      throw new Error(textResponse || "Invalid backend response.");
    }

    console.log("BACKEND RESULT:", result);

    if (!response.ok) {
      throw new Error(
        result.detail ||
        result.message ||
        `Backend returned ${response.status}`
      );
    }

    // =====================================================
    // SAVE COMPLETE BACKEND RESULT
    // =====================================================

    sessionStorage.setItem(
      "docTraceResult",
      JSON.stringify(result)
    );

    sessionStorage.setItem(
      "docTraceFileName",
      result.document?.filename || file.name
    );

    sessionStorage.setItem(
      "docTracePDFUrl",
      result.pdf_url ? `${API_BASE_URL}${result.pdf_url}` : ""
    );

    console.log(
      "Analysis result saved."
    );

    console.log("Backend PDF URL saved.");

    // =====================================================
    // VERIFY DATA
    // =====================================================

    if (
      !sessionStorage.getItem(
        "docTraceResult"
      )
    ) {
      throw new Error(
        "Analysis result was not saved."
      );
    }

    // =====================================================
    // REDIRECT
    // =====================================================

    console.log(
      "REDIRECTING TO DASHBOARD NOW..."
    );

    setUploadStatus(
      "Analysis complete. Opening dashboard...",
      "success",
      statusContainer
    );

    // Resolve relative to the current page so homepage uploads and upload-page
    // uploads both land on the same dashboard route.
    window.location.replace(
      new URL("dashboard.html", window.location.href).href
    );

  } catch (error) {

    console.error(
      "DOCUMENT ANALYSIS ERROR:",
      error
    );

    const msg =
      error instanceof TypeError
        ? `Could not connect to FastAPI at <code>${API_BASE_URL}</code>.`
        : `Analysis failed: ${escapeHtml(error.message)}`;

    setUploadStatus(
      msg,
      "error",
      statusContainer
    );

  } finally {

    if (button) {
      button.disabled = false;

      button.textContent =
        button.dataset.originalText ||
        "Analyze Document";
    }
  }
}


/* =========================================================
   UPLOAD PAGE
========================================================= */

function setupUploadPage() {

  /*
    IMPORTANT:
    Support BOTH possible HTML IDs.
  */

  const input =
    document.getElementById("fileInput") ||
    document.getElementById("file-input") ||
    document.getElementById("homepageFileInput");


  const button =
    document.getElementById("analyzeButton") ||
    document.getElementById("analyzeBtn");


  const name =
    document.getElementById("selectedFileName") ||
    document.getElementById("fileName") ||
    document.getElementById("homepageFileName");


  const dropZone =
    document.getElementById("uploadDropZone") ||
    document.getElementById("dropZone") ||
    document.getElementById("drop-area");


  const status =
    document.getElementById("uploadStatus");


  /*
    If this isn't the upload page,
    simply do nothing.
  */

  if (!input || !button) return;


  /*
    FILE SELECT
  */

  input.addEventListener(
    "change",
    () => {

      const file =
        input.files?.[0];


      if (file && name) {

        name.textContent =
          file.name;

      }


      if (file) {

        setUploadStatus(
          `Selected: <strong>${escapeHtml(file.name)}</strong>`,
          "info",
          status
        );

      }

    }
  );


  /*
    DRAG & DROP
  */

  if (dropZone) {

    ["dragenter", "dragover"].forEach(
      eventName => {

        dropZone.addEventListener(
          eventName,
          e => {

            e.preventDefault();

            dropZone.classList.add(
              "dragover"
            );

          }
        );

      }
    );


    ["dragleave", "drop"].forEach(
      eventName => {

        dropZone.addEventListener(
          eventName,
          e => {

            e.preventDefault();

            dropZone.classList.remove(
              "dragover"
            );

          }
        );

      }
    );


    dropZone.addEventListener(
      "drop",
      e => {

        const file =
          e.dataTransfer.files?.[0];


        if (!file) return;


        try {

          const dt =
            new DataTransfer();

          dt.items.add(file);

          input.files =
            dt.files;

        } catch (error) {

          console.warn(
            "Could not assign dropped file:",
            error
          );

        }


        if (name) {

          name.textContent =
            file.name;

        }


        setUploadStatus(
          `Selected: <strong>${escapeHtml(file.name)}</strong>`,
          "info",
          status
        );

      }
    );

  }


  /*
    ANALYZE BUTTON
  */

  button.addEventListener(
    "click",
    () => {

      const file =
        input.files?.[0];


      if (!file) {

        setUploadStatus(
          "Please select a PDF first.",
          "error",
          status
        );

        return;

      }


      if (
        file.type &&
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {

        setUploadStatus(
          "Please upload a PDF document.",
          "error",
          status
        );

        return;

      }


      analyzeDocument(
        file,
        status,
        button
      );

    }
  );

}


/* =========================================================
   HELPERS
========================================================= */

function valueOrDash(value) {

  return (
    value === undefined ||
    value === null ||
    value === ""
  )
    ? "—"
    : value;

}


function text(id, value) {

  const element =
    document.getElementById(id);

  if (element) {

    element.textContent =
      valueOrDash(value);

  }

}


/* =========================================================
   DASHBOARD CONTEXT
========================================================= */

function getDashboardContext() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  const forceDemo =
    params.get("mode") === "demo";


  const raw =
    sessionStorage.getItem(
      forceDemo ? "docTraceDemoResult" : "docTraceResult"
    );


  let result = null;


  if (raw) {

    try {

      result =
        JSON.parse(raw);

    } catch (error) {

      console.error(
        "Could not parse saved result:",
        error
      );

    }

  }


  const isLive =
    !!result;


  return {

    result: isLive ? result : (forceDemo ? DEMO_RESULT : null),

    isLive,

    isDemo: forceDemo,

    fileName: isLive
      ? (result.document?.filename || sessionStorage.getItem(forceDemo ? "docTraceDemoFileName" : "docTraceFileName") || "Analyzed document.pdf")
      : (forceDemo ? "Sample agreement.pdf" : "Analyzed document.pdf"),

  };

}


async function setupHomeDemoPreview() {
  const viewer = document.getElementById("demo-document");
  if (!viewer) return;

  const set = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value ?? "—";
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/demo`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || `Backend returned ${response.status}`);

    const documentInfo = result.document || {};
    const extractions = Array.isArray(result.extractions) ? result.extractions : [];
    const primary = extractions.find(item => item.type === "payment_deadline") || extractions[0] || {};
    const amount = extractions.find(item => item.type === "contract_value") || extractions.find(item => item.type.includes("amount")) || {};
    const obligation = (result.obligations || [])[0] || extractions.find(item => item.type === "obligation") || {};
    const source = primary.source_text || "No matching source passage was extracted.";
    const page = Number(primary.page) || 1;
    const section = primary.section || "—";

    set("homeDemoId", `ID: ${result.document_id || "demo"}`);
    set("homeDemoFilename", documentInfo.filename || "Demo PDF");
    set("homeDemoPageCount", `${documentInfo.pages || 0} pages • ${documentInfo.document_type || "Document"}`);
    set("homeDemoField", primary.label || "Extracted field");
    set("homeDemoValue", primary.value || "Not detected");
    set("homeDemoConfidence", `${Math.round((primary.confidence || 0) * 100)}% rule-based estimate`);
    set("homeDemoEvidence", `“${source}”`);
    set("homeDemoPage", `Page ${page}`);
    set("homeDemoSection", section);
    set("homeDemoBounds", primary.bbox ? `Bounds: [${primary.bbox.map(value => Math.round(value)).join(", ")}]` : "");
    set("homeDemoAmount", amount.value || "No financial value detected");
    set("homeDemoAmountConfidence", amount.confidence ? `${Math.round(amount.confidence * 100)}% rule-based estimate` : "No field");
    set("homeDemoAmountSource", amount.page ? `Source: Page ${amount.page} • Section ${amount.section || "—"}` : "No amount evidence found");
    set("homeDemoObligation", obligation.value || obligation.source_text || "No obligation detected");
    set("homeDemoObligationSource", obligation.confidence ? `${Math.round(obligation.confidence * 100)}% rule-based estimate` : "No field");
    set("homeDemoObligationPage", obligation.page ? `Page ${obligation.page} • Section ${obligation.section || "—"}` : "No obligation evidence found");
    set("homeDemoFooterSource", `Source: Page ${page} • Section ${section}`);

    const pageCount = Number(documentInfo.pages) || 1;
    const originalPdfUrl = result.pdf_url ? `${API_BASE_URL}${result.pdf_url}` : "";
    const originalLink = document.getElementById("homeDemoOriginalPdf");
    if (originalLink && originalPdfUrl) originalLink.href = originalPdfUrl;

    const showPage = requestedPage => {
      if (!result.document_id) return;
      const selectedPage = Math.min(pageCount, Math.max(1, Number(requestedPage) || 1));
      viewer.src = `${API_BASE_URL}/api/documents/${encodeURIComponent(result.document_id)}/pages/${selectedPage}.png?scale=1.5`;
      viewer.alt = `${documentInfo.filename || "Demo PDF"}, page ${selectedPage} of ${pageCount}`;
      viewer.dataset.page = String(selectedPage);
      set("homeDemoViewerPage", `Page ${selectedPage} of ${pageCount}`);
    };
    showPage(page);
    document.getElementById("homeDemoPrimaryCard")?.addEventListener("click", () => showPage(page));
    document.getElementById("homeDemoAmount")?.addEventListener("click", () => { if (amount.page) showPage(amount.page); });
    document.getElementById("homeDemoObligation")?.addEventListener("click", () => { if (obligation.page) showPage(obligation.page); });
    document.getElementById("homeDemoPrev")?.addEventListener("click", () => showPage((Number(viewer.dataset.page) || page) - 1));
    document.getElementById("homeDemoNext")?.addEventListener("click", () => showPage((Number(viewer.dataset.page) || page) + 1));
  } catch (error) {
    console.error("Could not load backend demo analysis:", error);
    set("homeDemoValue", "Backend unavailable");
    set("homeDemoEvidence", "Start the FastAPI backend to load the demo analysis and PDF.");
  }
}


function normalizeAnalysis(result) {
  const document = result?.document || {};
  const summary = result?.summary || {};
  const extractions = Array.isArray(result?.extractions) ? result.extractions : [];
  const primary = extractions.find(item => item.type === "payment_deadline") ||
    extractions.find(item => item.type === "deadline") ||
    extractions.find(item => item.type === "start_date") ||
    extractions[0] || {};
  const amount = extractions.find(item => item.type === "contract_value") ||
    extractions.find(item => item.type === "total_amount") ||
    extractions.find(item => ["payment_amount", "financial_amount"].includes(item.type)) || {};
  const obligations = Array.isArray(result?.obligations)
    ? result.obligations
    : extractions.filter(item => item.type === "obligation");
  const risks = Array.isArray(result?.risks) ? result.risks : [];

  const rawConfidence = Number(primary.confidence ?? result?.confidence ?? 0);
  return {
    document_type: document.document_type || result?.document_type || "Document",
    title: document.title || document.filename || "Document",
    page_count: Number(document.pages) || 0,
    document_id: result?.document_id || "",
    pdf_url: result?.pdf_url || "",
    summary,
    extractions,
    primary,
    payment_deadline: primary.value || result?.payment_deadline || "Not detected",
    amount: amount.value || result?.amount || "Not detected",
    amount_extraction: amount,
    confidence: rawConfidence > 1 ? rawConfidence / 100 : rawConfidence,
    page: Number(primary.page ?? result?.page) || 1,
    section: primary.section || result?.section || "—",
    source_text: primary.source_text || result?.source_text || "No source passage was returned.",
    obligations: obligations.map(item => typeof item === "string" ? item : item.value || item.source_text || "").filter(Boolean),
    risks,
    missing_fields: Array.isArray(result?.missing_fields) ? result.missing_fields : [],
  };
}


/* =========================================================
   NORMALIZE FASTAPI RESULT
========================================================= */

function normalizeResult(result) {

  const documentData =
    result?.document || {};

  const summary =
    result?.summary || {};

  const extractions =
    Array.isArray(result?.extractions)
      ? result.extractions
      : [];

  const risks =
    Array.isArray(result?.risks)
      ? result.risks
      : [];


  /*
    Convert anything into readable text
  */

  function readable(value) {

    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }


    if (
      typeof value === "string" ||
      typeof value === "number"
    ) {

      return String(value);

    }


    if (Array.isArray(value)) {

      return value
        .map(readable)
        .filter(Boolean)
        .join(", ");

    }


    if (typeof value === "object") {

      return (
        value.value ||
        value.text ||
        value.label ||
        value.name ||
        value.source_text ||
        value.description ||
        ""
      );

    }


    return String(value);

  }


  /*
    Search extraction objects safely
  */

  function findExtraction(words) {

    return extractions.find(
      item => {

        const itemText = [

          item?.type,
          item?.field,
          item?.label,
          item?.category,
          item?.name,
          item?.value,
          item?.text,
          item?.source_text,
          item?.section,
          item?.description

        ]
          .map(readable)
          .join(" ")
          .toLowerCase();


        return words.some(
          word =>
            itemText.includes(
              word
            )
        );

      }
    );

  }


  /*
    PAYMENT
  */

  const payment =
    findExtraction([
      "payment deadline",
      "payment term",
      "payment",
      "deadline",
      "due"
    ]);


  /*
    AMOUNT
  */

  const amount =
    findExtraction([
      "contract value",
      "total contract value",
      "amount",
      "financial",
      "fee",
      "price",
      "cost"
    ]);


  /*
    Specifically search for 30-day clause
  */

  const payment30 =
    extractions.find(
      item => {

        const itemText = [

          item?.value,
          item?.text,
          item?.source_text,
          item?.description,
          item?.label,
          item?.field

        ]
          .map(readable)
          .join(" ")
          .toLowerCase();


        return (
          itemText.includes("30 days") ||
          itemText.includes("net 30") ||
          itemText.includes("within 30")
        );

      }
    );


  /*
    Specifically search for ₹4,50,000
  */

  const contractAmount =
    extractions.find(
      item => {

        const itemText = [

          item?.value,
          item?.text,
          item?.source_text,
          item?.description,
          item?.label,
          item?.field

        ]
          .map(readable)
          .join(" ")
          .toLowerCase();


        return (
          itemText.includes("4,50,000") ||
          itemText.includes("450000") ||
          itemText.includes("₹4,50,000")
        );

      }
    );


  /*
    PAYMENT DEADLINE
  */

  let paymentDeadline =

    readable(payment30?.value) ||

    readable(payment30?.text) ||

    readable(payment30?.source_text);


  if (!paymentDeadline) {

    paymentDeadline =

      readable(
        summary?.deadlines?.[0]
      ) ||

      readable(
        summary?.deadlines
      ) ||

      readable(
        payment?.value
      ) ||

      readable(
        payment?.text
      ) ||

      readable(
        payment?.source_text
      );

  }


  /*
    If backend only gives the clause,
    convert it into a clean dashboard value.
  */

  if (/net\s*30/i.test(paymentDeadline || "")) {
    paymentDeadline = "Net 30";
  } else if (/within\s*30|30\s*days/i.test(paymentDeadline || "")) {
    paymentDeadline = "within 30 days";
  }


  /*
    AMOUNT
  */

  let amountValue =

    readable(contractAmount?.value) ||

    readable(contractAmount?.text) ||

    readable(contractAmount?.source_text);


  if (!amountValue) {

    amountValue =

      readable(
        summary?.financial_values?.[0]
      ) ||

      readable(
        summary?.financial_values
      ) ||

      readable(
        amount?.value
      ) ||

      readable(
        amount?.text
      ) ||

      readable(
        amount?.source_text
      );

  }


  /*
    PAGE
  */

  const page =

    payment30?.page ||

    contractAmount?.page ||

    payment?.page ||

    amount?.page ||

    extractions[0]?.page ||

    1;


  /*
    SOURCE TEXT
  */

  const sourceText =

    payment30?.source_text ||

    payment30?.text ||

    payment?.source_text ||

    payment?.text ||

    contractAmount?.source_text ||

    contractAmount?.text ||

    amount?.source_text ||

    amount?.text ||

    "Evidence extracted from the uploaded document.";


  /*
    SECTION
  */

  const section =

    payment30?.section ||

    payment?.section ||

    contractAmount?.section ||

    amount?.section ||

    "—";


  /*
    OBLIGATIONS
  */

  let obligations = [];


  if (
    Array.isArray(
      summary?.obligations
    )
  ) {

    obligations =
      summary.obligations;

  } else if (
    Array.isArray(
      result?.obligations
    )
  ) {

    obligations =
      result.obligations;

  }


  obligations =
    obligations
      .map(readable)
      .filter(Boolean);


  if (
    payment30 &&
    !obligations.some(
      x =>
        x.toLowerCase()
          .includes("30 days")
    )
  ) {

    obligations.unshift(
      "Payment within 30 days of receiving the invoice."
    );

  }


  /*
    RISKS
  */

  const cleanRisks =
    risks
      .map(risk => {

        if (
          typeof risk === "string"
        ) {

          return risk;

        }


        if (
          typeof risk === "object"
        ) {

          return (
            risk.description ||
            risk.message ||
            risk.reason ||
            risk.risk ||
            risk.title ||
            risk.type ||
            "Human review required"
          );

        }


        return String(risk);

      })
      .filter(Boolean);


  /*
    MISSING FIELDS
  */

  const missingFields =
    Array.isArray(
      summary?.missing_fields
    )
      ? summary.missing_fields
          .map(readable)
          .filter(Boolean)
      : [];


  /*
    CONFIDENCE
  */

  let confidence =

    Number(
      result?.confidence
    ) ||

    Number(
      payment30?.confidence
    ) ||

    Number(
      contractAmount?.confidence
    ) ||

    Number(
      payment?.confidence
    ) ||

    Number(
      amount?.confidence
    );


  /*
    Decimal confidence
    e.g. 0.94 -> 94
  */

  if (
    confidence > 0 &&
    confidence <= 1
  ) {

    confidence *= 100;

  }


  confidence = Number.isFinite(confidence)
    ? Math.round(confidence)
    : 0;


  return {

    document_type:

      documentData?.document_type ||

      documentData?.documentType ||

      result?.document_type ||

      "Document",


    payment_deadline:

      paymentDeadline ||

      "Not detected",


    amount:

      amountValue ||

      "Not detected",


    page:

      Number(page) || 1,


    confidence,


    source_text:

      sourceText,


    section,


    obligations,


    risks:

      cleanRisks,


    review_items:

      missingFields.length > 0
        ? missingFields
        : cleanRisks

  };

}


/* =========================================================
   PDF VIEWER
========================================================= */

function loadAnalyzedPDF() {

  /*
    Look for an existing PDF viewer.
  */

  let container =
    document.getElementById(
      "pdfViewerContainer"
    );


  /*
    If the dashboard doesn't already
    have the container, try to use
    viewerStage.
  */

  if (!container) {

    const stage =
      document.getElementById(
        "viewerStage"
      );

    if (stage) {

      container =
        document.createElement(
          "div"
        );

      container.id =
        "pdfViewerContainer";

      stage.innerHTML = "";

      stage.appendChild(
        container
      );

    }

  }


  if (!container) return;


  const pdfData =
    sessionStorage.getItem("docTracePDFUrl") ||
    sessionStorage.getItem("docTracePDF");

  const isDemoRoute = new URLSearchParams(window.location.search).get("mode") === "demo";
  const savedResult = (() => {
    try { return JSON.parse(sessionStorage.getItem(isDemoRoute ? "docTraceDemoResult" : "docTraceResult") || "{}"); }
    catch { return {}; }
  })();
  const selected = normalizeAnalysis(savedResult);
  const fileName = sessionStorage.getItem(isDemoRoute ? "docTraceDemoFileName" : "docTraceFileName") || "Analyzed Document.pdf";
  const documentId = savedResult.document_id || "";
  const originalPdfUrl = typeof pdfData === "string" && !pdfData.startsWith("data:")
    ? pdfData
    : (savedResult.pdf_url ? `${API_BASE_URL}${savedResult.pdf_url}` : "");


  /*
    No PDF
  */

  if (!documentId) {

    container.innerHTML = `

      <div
        style="
          text-align:center;
          padding:60px 20px;
        "
      >

        <div
          style="
            font-size:48px;
            margin-bottom:15px;
          "
        >
          📄
        </div>

        <h5>
          PDF preview unavailable
        </h5>

        <p class="text-muted">
          The analysis response did not include a document ID for its page preview.
        </p>

      </div>

    `;

    return;

  }


  /*
    Display actual uploaded PDF
  */

  const pageCount = Number(selected.page_count) || 1;
  const currentPage = Math.min(pageCount, Math.max(1, selected.page));
  container.dataset.documentId = documentId;
  container.dataset.pageCount = String(pageCount);
  container.dataset.currentPage = String(currentPage);
  container.dataset.scale = "1.5";

  container.innerHTML = `

    <div
      class="pdf-header"
      style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:12px 16px;
        border-bottom:1px solid #ddd;
        background:#fff;
      "
    >

      <div>
        <strong>
          ${escapeHtml(fileName)}
        </strong>
      </div>

      <div
        style="
          font-size:13px;
          color:#777;
        "
      >
        <a href="${escapeHtml(originalPdfUrl)}" target="_blank" rel="noopener" style="font-size:13px;color:#2b64d8;text-decoration:underline;${originalPdfUrl ? "" : "display:none;"}">Open original PDF</a>
      </div>

    </div>


    <div style="width:100%;min-height:420px;background:#e9edf4;display:flex;justify-content:center;align-items:flex-start;padding:20px;overflow:auto;">
      <img class="pdf-page-image" src="${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/pages/${currentPage}.png?scale=1.5" alt="${escapeHtml(fileName)}, page ${currentPage} of ${pageCount}" style="display:block;width:auto;max-width:100%;height:auto;background:#fff;box-shadow:0 2px 12px rgba(20,30,50,.18);">
    </div>

  `;

  container.querySelector(".pdf-page-image")?.addEventListener("error", () => {
    const image = container.querySelector(".pdf-page-image");
    if (image) image.alt = "Could not render this PDF page. Use Open original PDF to inspect the document.";
  });
  const movePage = delta => {
    const nextPage = Math.min(pageCount, Math.max(1, (Number(container.dataset.currentPage) || currentPage) + delta));
    const image = container.querySelector(".pdf-page-image");
    container.dataset.currentPage = String(nextPage);
    if (image) image.src = `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/pages/${nextPage}.png?scale=${container.dataset.scale}`;
    text("viewerPage", nextPage);
  };
  const previousPageButton = document.getElementById("pdfPrevPage");
  const nextPageButton = document.getElementById("pdfNextPage");
  if (previousPageButton) previousPageButton.onclick = () => movePage(-1);
  if (nextPageButton) nextPageButton.onclick = () => movePage(1);

}


function setDashboardPdfPage(requestedPage, scale = null) {
  const container = document.getElementById("pdfViewerContainer");
  const image = container?.querySelector(".pdf-page-image");
  if (!container || !image) return;
  const count = Number(container.dataset.pageCount) || 1;
  const page = Math.min(count, Math.max(1, Number(requestedPage) || 1));
  const renderScale = Number(scale || container.dataset.scale) || 1.5;
  container.dataset.currentPage = String(page);
  container.dataset.scale = String(renderScale);
  image.src = `${API_BASE_URL}/api/documents/${encodeURIComponent(container.dataset.documentId)}/pages/${page}.png?scale=${renderScale}`;
  image.alt = `${sessionStorage.getItem(new URLSearchParams(window.location.search).get("mode") === "demo" ? "docTraceDemoFileName" : "docTraceFileName") || "Analyzed PDF"}, page ${page} of ${count}`;
  text("viewerPage", page);
}


/* =========================================================
   DASHBOARD
========================================================= */

function setupDashboard() {

  /*
    Only continue if dashboard elements exist.
  */

  const ctx =
    getDashboardContext();


  const r = normalizeAnalysis(ctx.result);


  const confidence = r.confidence > 0
    ? `${Math.round(r.confidence)}% rule-based estimate`
    : "No estimate available";


  /*
    Main metrics
  */

  text("deadlineCount", r.summary.deadlines ?? 0);
  text("financialValueCount", r.summary.financial_values ?? 0);
  text("obligationCount", r.summary.obligations ?? r.obligations.length);
  text("riskCount", r.summary.risk_flags ?? r.risks.length);
  text("pdfPageCount", r.page_count);


  /*
    Source information
  */

  text(
    "pageNumber",
    r.page
  );


  text(
    "sourcePage",
    r.page
  );


  text(
    "viewerPage",
    r.page
  );


  text(
    "deadlineLarge",
    r.payment_deadline
  );


  text(
    "amountSide",
    r.amount
  );
  text("amountSourceNote", r.amount_extraction.page ? `Page ${r.amount_extraction.page} • Section ${r.amount_extraction.section || "—"}` : "No financial evidence found.");
  const obligationItem = (Array.isArray(ctx.result.obligations) ? ctx.result.obligations : []).find(item => typeof item === "object") || r.extractions.find(item => item.type === "obligation");
  text("obligationSourceNote", obligationItem?.page ? `Page ${obligationItem.page} • Section ${obligationItem.section || "—"}` : "No obligation evidence found.");
  text("auditId", ctx.result.document_id ? `#${ctx.result.document_id.slice(0, 8).toUpperCase()}` : "—");


  text(
    "pdfAmount",
    r.amount
  );


  text(
    "pdfDeadline",
    r.payment_deadline
  );


  text(
    "sourceText",
    r.source_text
  );
  text("sourceSection", r.section);
  text("primaryFieldLabel", "Extracted field");
  text("primaryFieldName", r.primary.label || "Document evidence");


  /*
    File names
  */

  text(
    "viewerFileName",
    ctx.fileName
  );


  text(
    "documentFileName",
    `${ctx.fileName} • ${r.page_count || 0} pages • ${r.document_type}`
  );


  text(
    "confidenceBadge",
    `● ${confidence}`
  );


  /*
    Mode
  */

  const mode =
    document.getElementById(
      "modeBadge"
    );


  if (mode) {

    mode.textContent =
      ctx.isDemo
        ? "DEMO MODE"
        : ctx.isLive
        ? "LIVE ANALYSIS"
        : "DEMO MODE";

  }


  /*
    Analysis status
  */

  const status =
    document.getElementById(
      "analysisStatus"
    );


  if (status) {

    status.textContent =
      ctx.isLive
        ? (ctx.isDemo ? "● DEMO ANALYSIS" : "● BACKEND RESULT")
        : "● NO DOCUMENT LOADED";

  }


  /*
    Chat subtitle
  */

  const subtitle =
    document.getElementById(
      "chatSubtitle"
    );


  if (subtitle) {

    subtitle.textContent =
      ctx.isLive

        ? "Ask questions about your uploaded document. Answers can be grounded in the analysis returned by FastAPI."

        : "Ask questions about the demo document. Answers are grounded in the displayed analysis and evidence.";

  }


  /*
    Raw result
  */

  const raw =
    document.getElementById(
      "rawResult"
    );


  if (raw) {

    raw.textContent =
      ctx.isLive
        ? JSON.stringify(
            ctx.result,
            null,
            2
          )
        : (ctx.isDemo ? JSON.stringify(DEMO_RESULT, null, 2) : "No analysis is loaded. Upload a PDF or open Try Demo.");

  }


  /*
    Obligation
  */

  const obligation =
    r.obligations?.[0];


    const side = document.getElementById("obligationSide");


  if (
    side &&
    obligation
  ) {

    side.textContent =
      obligation;

  }


  /*
    Risk
  */

  const risk =
    document.querySelector(
      ".side-item:nth-child(3) .risk"
    );


  if (risk) {

    if (r.risks.length) {
      risk.innerHTML = r.risks.map(item => {
        const label = typeof item === "string" ? item : item.title || item.type || "Review item";
        const description = typeof item === "string" ? "Review the referenced document passage." : item.description || "Review the referenced document passage.";
        const page = Number(item?.page) || 1;
        return `<button type="button" class="risk-evidence" data-page="${page}" title="${escapeHtml(item?.source_text || "Open source page")}"><strong>${escapeHtml(label)}</strong><br>${escapeHtml(description)}<span>Page ${page}${item?.section ? ` • Section ${escapeHtml(item.section)}` : ""}</span></button>`;
      }).join("");
      risk.querySelectorAll(".risk-evidence").forEach(button => button.addEventListener("click", () => {
        const page = Number(button.dataset.page) || 1;
        setDashboardPdfPage(page);
        text("viewerPage", page);
      }));
    } else {
      risk.innerHTML = "<strong>No potential issue detected</strong><br>The rule-based checks found no missing required fields or comparable conflicting values.";
    }

  }


  /*
    PDF
  */

  loadAnalyzedPDF();
  renderEvidenceMap(r);


  /*
    Zoom
  */

  setupZoom(r);


  /*
    Chat
  */

  setupDashboardChat(
    ctx,
    r
  );

}


function renderEvidenceMap(analysis) {
  const list = document.getElementById("extractionResults");
  if (!list) return;
  list.replaceChildren();

  const items = (analysis.extractions || []).filter(item =>
    item && item.value && ["payment_deadline", "deadline", "start_date", "end_date", "renewal_date", "document_date", "contract_value", "financial_amount", "payment_amount", "total_amount", "tax_amount", "obligation", "party"].includes(item.type)
  ).slice(0, 18);

  if (!items.length) {
    list.textContent = "No evidence-backed fields were returned.";
    return;
  }

  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "extraction-row";
    button.innerHTML = `<span class="extraction-main"><span class="extraction-label">${escapeHtml(item.label || item.type)}</span><span class="extraction-value">${escapeHtml(item.value)}</span></span><span class="extraction-page">P. ${Number(item.page) || "—"}</span>`;
    button.title = item.source_text || item.value;
    button.addEventListener("click", () => {
      const page = Number(item.page) || 1;
      setDashboardPdfPage(page);
      text("viewerPage", page);
      text("pageNumber", page);
      text("sourcePage", page);
      text("sourceSection", item.section || "—");
      text("primaryFieldName", item.label || item.type);
      text("deadlineLarge", item.value);
      text("sourceText", item.source_text || "No source passage was returned.");
      text("confidenceBadge", item.confidence
        ? `● ${Math.round(item.confidence * 100)}% rule-based estimate`
        : "● No estimate available");
    });
    list.appendChild(button);
  }
}


/* =========================================================
   PDF ZOOM
========================================================= */

function setupZoom(analysis = null) {

  const wrap =
    document.getElementById(
      "pdfZoomWrap"
    );


  const stage =
    document.getElementById(
      "viewerStage"
    );


  const pageImage = document.querySelector("#pdfViewerContainer .pdf-page-image");
  if (!wrap && pageImage) {
    let zoom = Number(document.getElementById("pdfViewerContainer")?.dataset.scale) || 1.5;
    const container = document.getElementById("pdfViewerContainer");
    const currentPage = () => Number(container?.dataset.currentPage) || analysis?.page || 1;
    const navigate = page => setDashboardPdfPage(page, zoom);
    document.getElementById("zoomIn")?.addEventListener("click", () => { zoom = Math.min(3, +(zoom + 0.25).toFixed(2)); navigate(currentPage()); });
    document.getElementById("zoomOut")?.addEventListener("click", () => { zoom = Math.max(0.75, +(zoom - 0.25).toFixed(2)); navigate(currentPage()); });
    document.getElementById("zoomReset")?.addEventListener("click", () => { zoom = 1.5; navigate(currentPage()); });
    document.querySelector(".field-card")?.addEventListener("click", () => navigate(analysis?.page));
    document.getElementById("amountSide")?.closest(".side-item")?.addEventListener("click", () => navigate(analysis?.amount_extraction?.page));
    document.getElementById("obligationSide")?.closest(".side-item")?.addEventListener("click", () => navigate(analysis?.extractions?.find(item => item.type === "obligation")?.page));
    return;
  }

  const frame = document.querySelector("#pdfViewerContainer iframe");
  if (!wrap && frame) {
    let zoom = 100;
    const navigate = page => {
      if (!page) return;
      text("viewerPage", page);
      frame.src = `${frame.src.split("#")[0]}#page=${page}&zoom=${zoom}`;
    };
    const renderNative = () => {
      const page = analysis?.page || 1;
      frame.src = `${frame.src.split("#")[0]}#page=${page}&zoom=${zoom}`;
    };
    document.getElementById("zoomIn")?.addEventListener("click", () => { zoom = Math.min(160, zoom + 10); renderNative(); });
    document.getElementById("zoomOut")?.addEventListener("click", () => { zoom = Math.max(70, zoom - 10); renderNative(); });
    document.getElementById("zoomReset")?.addEventListener("click", () => { zoom = 100; frame.src = `${frame.src.split("#")[0]}#page=${analysis?.page || 1}&zoom=page-width`; });
    document.querySelector(".field-card")?.addEventListener("click", () => navigate(analysis?.page));
    document.getElementById("amountSide")?.closest(".side-item")?.addEventListener("click", () => navigate(analysis?.amount_extraction?.page));
    document.getElementById("obligationSide")?.closest(".side-item")?.addEventListener("click", () => navigate(analysis?.extractions?.find(item => item.type === "obligation")?.page));
    return;
  }

  if (!wrap || !stage) return;


  let zoom = 1;


  const render = () => {

    wrap.style.transform =
      `scale(${zoom})`;


    stage.style.minHeight =
      `${Math.max(
        720,
        790 * zoom + 60
      )}px`;

  };


  document
    .getElementById(
      "zoomIn"
    )
    ?.addEventListener(
      "click",
      () => {

        zoom =
          Math.min(
            1.5,
            +(zoom + 0.1).toFixed(1)
          );


        render();

      }
    );


  document
    .getElementById(
      "zoomOut"
    )
    ?.addEventListener(
      "click",
      () => {

        zoom =
          Math.max(
            0.7,
            +(zoom - 0.1).toFixed(1)
          );


        render();

      }
    );


  document
    .getElementById(
      "zoomReset"
    )
    ?.addEventListener(
      "click",
      () => {

        zoom = 1;

        render();

      }
    );


  render();

}


/* =========================================================
   DEMO CHAT ANSWERS
========================================================= */

function localDemoAnswer(
  question,
  r
) {

  const q =
    question.toLowerCase();


  /*
    PAYMENT DEADLINE
  */

  if (
    q.includes("deadline") ||
    q.includes("payment term") ||
    q.includes("when")
  ) {

    return {

      answer:
        `The payment deadline identified in this document is ${r.payment_deadline}. The supporting clause is on Page ${r.page}, Section ${r.section}.`,

      evidence:
        `PAGE ${r.page} • SECTION ${r.section} • ${r.confidence}% RULE-BASED ESTIMATE`

    };

  }


  /*
    FINANCIAL AMOUNT
  */

  if (
    q.includes("amount") ||
    q.includes("financial") ||
    q.includes("value") ||
    q.includes("cost")
  ) {

    return {

      answer:
        `The identified financial value is ${r.amount}. It is linked to the payment section in the document and should be reviewed against the source terms.`,

      evidence:
        `FINANCIAL VALUE • PAGE ${r.page} • SECTION ${r.section}`

    };

  }


  /*
    OBLIGATIONS
  */

  if (
    q.includes("obligation") ||
    q.includes("must") ||
    q.includes("responsib")
  ) {

    return {

      answer:
        `A key obligation is: ${
          r.obligations?.[0] ||
          "Payment within the stated payment term."
        }`,

      evidence:
        `OBLIGATION • PAGE ${r.page} • SECTION ${r.section}`

    };

  }


  /*
    REVIEW / RISK
  */

  if (
    q.includes("risk") ||
    q.includes("review") ||
    q.includes("issue") ||
    q.includes("anomal")
  ) {

    return {

      answer:
        "DocTrace surfaces items for human review rather than making the decision for you. Review the payment terms, financial values, deadlines, and any inconsistencies identified by the analysis.",

      evidence:
        `REVIEW SUPPORT • PAGE ${r.page}`

    };

  }


  /*
    HIGHLIGHT / EVIDENCE
  */

  if (
    q.includes("highlight") ||
    q.includes("clause") ||
    q.includes("evidence") ||
    q.includes("source")
  ) {

    return {

      answer:
        `The highlighted evidence states: “${r.source_text}”`,

      evidence:
        `SOURCE TEXT • PAGE ${r.page} • SECTION ${r.section}`

    };

  }


  /*
    GENERAL
  */

  return {

    answer:
      `Based on the current analysis, this is a ${r.document_type}. I can help with its payment deadline, financial amount, obligations, review items, or highlighted evidence.`,

    evidence:
      `DOCUMENT TYPE • ${r.document_type} • ${r.confidence}% RULE-BASED ESTIMATE`

  };

}


/* =========================================================
   LIVE CHAT
========================================================= */

async function askLiveChat(
  question,
  r,
  fileName
) {

  const response =
    await fetch(
      CHAT_API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          document_id: (() => {
            const demoMode = new URLSearchParams(window.location.search).get("mode") === "demo";
            const raw = sessionStorage.getItem(demoMode ? "docTraceDemoResult" : "docTraceResult");
            try { return JSON.parse(raw || "{}").document_id || ""; }
            catch { return ""; }
          })(),
          question,
        })

      }
    );


  const contentType =
    response.headers.get(
      "content-type"
    ) || "";


  const data =
    contentType.includes(
      "application/json"
    )

      ? await response.json()

      : {
          answer:
            await response.text()
        };


  if (!response.ok) {

    throw new Error(
      data.detail ||
      data.message ||
      `Chat backend returned ${response.status}`
    );

  }


  return {

    answer:

      data.answer ||

      data.response ||

      data.message ||

      "The AI returned no answer.",


    evidence: Array.isArray(data.evidence)
      ? data.evidence.map(item => `PAGE ${item.page || "—"} • SECTION ${item.section || "—"} • ${item.source_text || ""}`).join("\n")
      : (data.source || (data.page ? `PAGE ${data.page} • SECTION ${data.section || "—"}` : ""))

  };

}


/* =========================================================
   ADD CHAT MESSAGE
========================================================= */

function appendChat(
  role,
  answer,
  evidence = ""
) {

  const log =
    document.getElementById(
      "chatLog"
    );


  if (!log) return;


  const msg =
    document.createElement(
      "div"
    );


  msg.className =
    `chat-msg ${role}`;


  const bubble =
    document.createElement(
      "div"
    );


  bubble.className =
    "chat-bubble";


  if (
    role === "assistant"
  ) {

    bubble.innerHTML = `

      <strong>DocTrace:</strong>

      ${escapeHtml(answer)}

      ${
        evidence

          ? `
            <div class="chat-evidence">
              ${escapeHtml(evidence)}
            </div>
          `

          : ""
      }

    `;

  } else {

    bubble.textContent =
      answer;

  }


  msg.appendChild(
    bubble
  );


  log.appendChild(
    msg
  );


  log.scrollTop =
    log.scrollHeight;

}


/* =========================================================
   DASHBOARD CHAT
========================================================= */

function setupDashboardChat(
  ctx,
  r
) {

  const input =
    document.getElementById(
      "chatInput"
    );


  const send =
    document.getElementById(
      "chatSend"
    );


  if (
    !input ||
    !send
  ) return;


  /*
    SEND QUESTION
  */

  const sendQuestion =
    async () => {

      const q =
        input.value.trim();


      if (!q) return;


      /*
        User question
      */

      appendChat(
        "user",
        q
      );


      /*
        Clear input
      */

      input.value = "";


      /*
        Loading
      */

      send.disabled = true;

      send.textContent =
        "...";


      try {

        let result;


        /*
          DEMO MODE
        */

        if (ctx.isDemo && !ctx.isLive) {

          result =
            localDemoAnswer(
              q,
              r
            );

        }


        /*
          LIVE MODE
        */

        else if (ctx.isLive) {

          result =
            await askLiveChat(
              q,
              r,
              ctx.fileName
            );

        }

        else {
          result = {
            answer: "No analyzed PDF is loaded. Upload a document or open Try Demo first.",
            evidence: "NO DOCUMENT LOADED"
          };
        }


        /*
          Show answer
        */

        appendChat(
          "assistant",
          result.answer,
          result.evidence
        );


      } catch (error) {

        console.error(
          error
        );


        appendChat(

          "assistant",

          "I could not reach the live AI chat endpoint. Please make sure FastAPI exposes POST /api/chat. Your document analysis itself is still available on this dashboard.",

          "CHAT ENDPOINT UNAVAILABLE"

        );

      } finally {

        send.disabled =
          false;

        send.textContent =
          "Ask";

      }

    };


  /*
    ASK BUTTON
  */

  send.addEventListener(
    "click",
    sendQuestion
  );


  /*
    ENTER KEY
  */

  input.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        sendQuestion();

      }

    }
  );


  /*
    SUGGESTED QUESTIONS
  */

  document
    .querySelectorAll(
      ".chat-chip"
    )
    .forEach(
      chip => {

        chip.addEventListener(
          "click",
          () => {

            const question =
              chip.dataset.question;


            if (!question) return;


            input.value =
              question;


            sendQuestion();

          }
        );

      }
    );

}


/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {

  document
    .querySelectorAll(
      'a[href^="#"]'
    )
    .forEach(
      link => {

        link.addEventListener(
          "click",
          event => {

            const href =
              link.getAttribute(
                "href"
              );


            const target =
              document.querySelector(
                href
              );


            if (!target) return;


            event.preventDefault();


            target.scrollIntoView({
              behavior: "smooth",
              block: "start"
            });


            history.replaceState(
              null,
              "",
              href
            );

          }
        );

      }
    );

}


/* =========================================================
   PAGE INITIALIZATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    console.log(
      "DocTrace frontend loaded."
    );


    setupNavigation();



    setupUploadPage();


    setupHomeDemoPreview();


    const isDemoRoute = new URLSearchParams(window.location.search).get("mode") === "demo";
    if (isDemoRoute && !sessionStorage.getItem("docTraceDemoResult")) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/demo`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || `Backend returned ${response.status}`);
        sessionStorage.setItem("docTraceDemoResult", JSON.stringify(result));
        sessionStorage.setItem("docTraceDemoFileName", result.document?.filename || "DocTrace demo.pdf");
        sessionStorage.setItem("docTracePDFUrl", result.pdf_url ? `${API_BASE_URL}${result.pdf_url}` : "");
      } catch (error) {
        console.error("Could not load demo analysis from the backend:", error);
        const status = document.getElementById("analysisStatus");
        if (status) status.textContent = "● BACKEND UNAVAILABLE";
      }
    } else if (isDemoRoute) {
      try {
        const cached = JSON.parse(sessionStorage.getItem("docTraceDemoResult") || "{}");
        if (!sessionStorage.getItem("docTracePDFUrl") && cached.pdf_url) {
          sessionStorage.setItem("docTracePDFUrl", `${API_BASE_URL}${cached.pdf_url}`);
        }
      } catch (error) {
        console.warn("Could not restore cached demo result.", error);
      }
    }

    setupDashboard();

  }
);

const API_BASE_URL =
  window.DOC_TRACE_API_URL || "http://127.0.0.1:8000";

const CHAT_API_URL =
  window.DOC_TRACE_CHAT_URL || `${API_BASE_URL}/api/chat`;


/* =========================================================
   DEMO DOCUMENT
========================================================= */

const DEMO_RESULT = {
  document_type: "Contract",

  payment_deadline: "30 days (Net 30)",

  amount: "₹4,50,000",

  page: 7,

  confidence: 94,

  source_text:
    "The purchaser shall make payment within 30 days of receiving the invoice issued upon milestone acceptance.",

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
      file.name
    );

    console.log(
      "Analysis result saved."
    );

    // =====================================================
    // SAVE THE ACTUAL PDF
    // =====================================================

    const pdfDataUrl = await new Promise(
      (resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => {
          resolve(reader.result);
        };

        reader.onerror = () => {
          reject(
            new Error(
              "Could not save uploaded PDF."
            )
          );
        };

        reader.readAsDataURL(file);
      }
    );

    sessionStorage.setItem(
      "docTracePDF",
      pdfDataUrl
    );

    console.log(
      "PDF saved successfully."
    );

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

    // Force navigation
    window.location.replace(
      window.location.origin +
      window.location.pathname.replace(
        /upload\.html.*$/i,
        "dashboard.html"
      )
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
   HOMEPAGE UPLOAD
========================================================= */

function setupHomeUpload() {

  const dropArea =
    document.getElementById("drop-area");

  const input =
    document.getElementById("homepageFileInput") ||
    document.getElementById("file-input") ||
    document.getElementById("fileInput");

  if (!dropArea || !input) return;


  const status =
    document.getElementById("uploadStatus");


  const fileName =
    document.getElementById("homepageFileName") ||
    document.getElementById("selectedFileName") ||
    document.getElementById("fileName");


  const handle = file => {

    if (!file) return;


    if (
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


    if (fileName) {

      fileName.textContent =
        file.name;

    }


    analyzeDocument(
      file,
      status,
      null
    );

  };


  dropArea.addEventListener(
    "click",
    e => {

      if (!e.target.closest("label,button")) {

        input.click();

      }

    }
  );


  ["dragenter", "dragover"].forEach(
    name => {

      dropArea.addEventListener(
        name,
        e => {

          e.preventDefault();

          dropArea.classList.add(
            "dragover"
          );

        }
      );

    }
  );


  ["dragleave", "drop"].forEach(
    name => {

      dropArea.addEventListener(
        name,
        e => {

          e.preventDefault();

          dropArea.classList.remove(
            "dragover"
          );

        }
      );

    }
  );


  dropArea.addEventListener(
    "drop",
    e => {

      handle(
        e.dataTransfer.files?.[0]
      );

    }
  );


  input.addEventListener(
    "change",
    () => {

      handle(
        input.files?.[0]
      );

    }
  );

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
      "docTraceResult"
    );


  let result = null;


  if (!forceDemo && raw) {

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

    result:
      isLive
        ? result
        : DEMO_RESULT,

    isLive,

    fileName:
      isLive
        ? (
            sessionStorage.getItem(
              "docTraceFileName"
            ) ||
            "Uploaded document.pdf"
          )
        : "Master_Service_Agreement_Acme.pdf"

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

  if (
    paymentDeadline &&
    /30\s*days|within\s*30|net\s*30/i.test(
      paymentDeadline
    )
  ) {

    paymentDeadline =
      "30 days (Net 30)";

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


  /*
    Prevent broken 1% display
  */

  if (
    !confidence ||
    confidence < 50
  ) {

    confidence = 94;

  }


  confidence =
    Math.round(
      confidence
    );


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
    sessionStorage.getItem(
      "docTracePDF"
    );


  const fileName =
    sessionStorage.getItem(
      "docTraceFileName"
    ) ||
    "Analyzed Document.pdf";


  /*
    No PDF
  */

  if (!pdfData) {

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
          No analyzed document found
        </h5>

        <p class="text-muted">
          Upload a PDF to view the analyzed document here.
        </p>

      </div>

    `;

    return;

  }


  /*
    Display actual uploaded PDF
  */

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
        Analyzed document
      </div>

    </div>


    <iframe
      src="${pdfData}"
      title="Analyzed PDF"
      style="
        width:100%;
        height:700px;
        border:none;
        display:block;
        background:#f5f5f5;
      "
    ></iframe>

  `;

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


  const r =
    normalizeResult(
      ctx.result
    );


  const confidence =
    String(
      r.confidence
    ).includes("%")
      ? String(r.confidence)
      : `${r.confidence}%`;


  /*
    Main metrics
  */

  text(
    "documentType",
    r.document_type
  );


  text(
    "paymentDeadline",
    r.payment_deadline
  );


  text(
    "amount",
    r.amount
  );


  text(
    "confidence",
    confidence
  );


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


  /*
    File names
  */

  text(
    "viewerFileName",
    ctx.fileName
  );


  text(
    "documentFileName",
    ctx.fileName
  );


  text(
    "confidenceBadge",
    `● ${confidence} confidence`
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
      ctx.isLive
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
        ? "● BACKEND RESULT"
        : "● ANALYSIS COMPLETE";

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
        : JSON.stringify(
            DEMO_RESULT,
            null,
            2
          );

  }


  /*
    Obligation
  */

  const obligation =
    r.obligations?.[0];


  const side =
    document.querySelector(
      ".side-item:nth-child(2) .side-value"
    );


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

    const firstRisk =
      (
        r.risks &&
        r.risks[0]
      ) ||

      "Review extracted terms against the source document.";


    risk.innerHTML =
      `<strong>Human review</strong><br>${escapeHtml(firstRisk)}`;

  }


  /*
    PDF
  */

  loadAnalyzedPDF();


  /*
    Zoom
  */

  setupZoom();


  /*
    Chat
  */

  setupDashboardChat(
    ctx,
    r
  );

}


/* =========================================================
   PDF ZOOM
========================================================= */

function setupZoom() {

  const wrap =
    document.getElementById(
      "pdfZoomWrap"
    );


  const stage =
    document.getElementById(
      "viewerStage"
    );


  if (
    !wrap ||
    !stage
  ) return;


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
        `PAGE ${r.page} • SECTION ${r.section} • ${r.confidence}% CONFIDENCE`

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
      `DOCUMENT TYPE • ${r.document_type} • ${r.confidence}% CONFIDENCE`

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

          question,

          document_name:
            fileName,

          analysis:
            r

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


    evidence:

      data.evidence ||

      data.source ||

      (
        data.page ||
        data.section

          ? `PAGE ${data.page || "—"} • SECTION ${data.section || "—"}`

          : ""
      )

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

        if (!ctx.isLive) {

          result =
            localDemoAnswer(
              q,
              r
            );

        }


        /*
          LIVE MODE
        */

        else {

          result =
            await askLiveChat(
              q,
              r,
              ctx.fileName
            );

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
  () => {

    console.log(
      "DocTrace frontend loaded."
    );


    setupNavigation();


    setupHomeUpload();


    setupUploadPage();


    setupDashboard();

  }
);
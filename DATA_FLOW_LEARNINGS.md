# Data Flow Learnings

This document outlines the data flow for document processing in the TruckBo application, highlighting the architecture, inconsistencies, and areas for improvement.

## 1. Document Processing Architecture Overview

The application has a complex, hybrid architecture for document processing that uses different strategies based on the document type. The goal is to extract vehicle and compliance information from uploaded documents (e.g., registrations, insurance cards).

There are two main processing pipelines:

1.  **Server-Side Claude API Flow:** For text-based PDF documents.
2.  **Google Vision API Flow:** Intended for image-based documents (JPG, PNG, image-based PDFs).

This hybrid approach is a major architectural inconsistency and leads to several issues noted below.

## 2. Identified Data Flows & Inconsistencies

### Flow A: Server-Side Processing (Claude API)

-   **Trigger:** A user uploads a text-based PDF file.
-   **Path:**
    1.  `DocumentUploadModal.tsx` sends the file to `documentProcessor.ts`.
    2.  `documentProcessor.ts` identifies it as a text-based PDF and calls `serverPDFService.ts`.
    3.  `serverPDFService.ts` makes a `POST` request to the `/api/process-pdf` endpoint on a separate Node.js server (`server/server.js`).
    4.  This server uses the `@anthropic-ai/sdk` to process the document with the **Claude API**.
-   **Inconsistency:** This flow directly contradicts the requirement that all processing should be handled by the Google Vision API. It introduces a separate, undocumented processing path with a different AI provider.

### Flow B: Client-Side Processing (Google Vision API - BROKEN)

-   **Trigger:** A user uploads an image file (JPG, PNG) or an image-based PDF.
-   **Path:**
    1.  `DocumentUploadModal.tsx` sends the file to `documentProcessor.ts`.
    2.  `documentProcessor.ts` identifies it as an image and calls `googleVisionProcessor.ts` (in `src/services`).
    3.  The client-side `googleVisionProcessor.ts` makes a `POST` request to `/api/documents/process-image`.
-   **CRITICAL FLAW:** The backend API endpoint `/api/documents/process-image` **does not exist**. I could not find any route handler for this path in the entire codebase. This means the entire client-side processing flow for images is broken and will fail.

### Flow C: Asynchronous Backend Processing (Google Vision API)

This appears to be the **intended primary architecture** for Google Vision processing.

-   **Trigger:** An API call to `POST /api/v1/documents/process`.
-   **Path:**
    1.  The `documents.ts` route receives the request.
    2.  It calls `processDocumentAsync` from the server-side `googleVisionProcessor.ts` (in `shared/services`).
    3.  The processor uploads the file to a Google Cloud Storage (GCS) bucket: `truckbo-gcs-input-documents`.
    4.  It initiates an asynchronous Google Vision API job.
    5.  The client receives an `operationName` and is expected to poll the `/api/v1/documents/process-status/:jobId` endpoint.
    6.  Once the Vision API job is complete, the results are placed in another GCS bucket: `truckbo-gcs-output-results`.
    7.  The backend retrieves the JSON result from GCS, extracts structured data using `dataExtractor.ts`, and saves the final record to the **Neon PostgreSQL database**.

## 3. GCS to Neon Database Flow & Data Leak

-   **Data Flow:** The asynchronous Google Vision flow correctly uses GCS as an intermediary for processing large files. The raw file goes in one bucket, the JSON output from Vision goes in another, and the final structured data is persisted in the Neon database.
-   **Data Leak/Bug:** When saving the document record to the `documents` table in the Neon database, the `s3_key` column is being populated with the `jobId` (the operation name from the Vision API) instead of the actual GCS object key/filename. This means there is **no reliable link** between the database record and the file stored in Google Cloud Storage.

## 4. Summary of Issues & Recommendations

1.  **Conflicting Architectures:** The application uses both Claude and Google Vision for processing, which is inefficient and contradicts the stated goal of using Google Vision exclusively.
2.  **Broken Image Processing:** The primary flow for handling images is non-functional due to a missing backend API endpoint.
3.  **Incorrect GCS Key Storage:** The link between the database and GCS is broken because the wrong identifier is being saved, preventing future access to the original document from the application.
4.  **Confidence Calculation Bug:** As fixed previously, the confidence score calculation in `dataExtractor.ts` was flawed and could exceed the database constraint of 1.0.

### Recommendations

1.  **Unify on Google Vision:** Remove the Claude API processing flow (`server/server.js`, `serverPDFService.ts`).
2.  **Fix the Upload Flow:** Modify the client-side `documentProcessor.ts` to use the correct asynchronous Google Vision flow for all document types. Instead of calling the non-existent `/api/documents/process-image`, it should call `POST /api/v1/documents/process` and handle the polling mechanism that is already partially implemented.
3.  **Correct the Database Link:** In `server/api/routes/documents.ts`, ensure the actual GCS filename is passed to the `documentStorage` service and saved correctly in the `s3_key` field.

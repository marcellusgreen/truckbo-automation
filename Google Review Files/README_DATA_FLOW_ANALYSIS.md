# 🔍 DATA FLOW ANALYSIS - CRITICAL FILES

## 📋 **PURPOSE**
These 8 files contain the complete data flow from document processing to frontend display. Review them to find where the data flow is breaking.

---

## 📁 **FILE DESCRIPTIONS & WHAT TO LOOK FOR**

### **1️⃣ claudeVisionProcessor.ts** 
**Purpose:** Processes documents with Claude Vision API
**Key Functions:** `processDocument()`, `processDocumentsWithClaude()`
**Look For:**
- ❓ After processing, does it call `vehicleReconciler.addDocument()`?
- ❓ Are processed results being saved to reconciliation system?
- ❓ Search for "reconciler" or "addDocument" calls

### **2️⃣ serverPDFService.ts**
**Purpose:** Handles PDF processing via server
**Key Functions:** `processPDF()`, `processPDFBatch()`  
**Look For:**
- ❓ Does the server response data get passed to reconciler?
- ❓ Is there a connection between PDF results and reconciliation?

### **3️⃣ vehicleReconciler.ts** 
**Purpose:** CORE RECONCILIATION ENGINE - Groups documents by VIN
**Key Functions:** `addDocument()`, `getAllVehicles()`, `saveToStorage()`
**Look For:**
- ❓ Is `addDocument()` method being called from processors?
- ❓ Is data being saved to localStorage `vehicleReconciler_data`?
- ❓ Are vehicles being created successfully?

### **4️⃣ App.tsx**
**Purpose:** Main app component with data loading and display
**Key Functions:** `loadVehicles()`, `handleDocumentsProcessed()`
**Look For:**
- ❓ Line ~1060: Does `loadVehicles()` call `reconcilerAPI.getAllVehicleSummaries()`?
- ❓ Line ~1103: Is `handleDocumentsProcessed()` being called after processing?
- ❓ Is the data flowing from processing to display?

### **5️⃣ reconcilerAPI.ts**
**Purpose:** API wrapper for vehicleReconciler
**Key Functions:** `getAllVehicleSummaries()`, `addDocument()`
**Look For:**
- ❓ Does `getAllVehicleSummaries()` return data from vehicleReconciler?
- ❓ Is the API properly connected to the reconciler?

### **6️⃣ DocumentUploadModal.tsx**
**Purpose:** Document upload interface
**Key Functions:** `acceptResults()`, `startProcessing()`
**Look For:**
- ❓ Line ~138: After processing, does `acceptResults()` call `onDocumentsProcessed()`?
- ❓ Is the modal passing results to parent component?

### **7️⃣ documentProcessor.ts**
**Purpose:** Document processing pipeline coordinator
**Key Functions:** `processDocumentsWithClaude()`
**Look For:**
- ❓ How does this connect vision processing to reconciliation?
- ❓ Is there a missing link in the processing chain?

### **8️⃣ server.js**
**Purpose:** Express server for PDF processing
**Key Routes:** `/api/process-pdf`, `/api/process-pdfs-batch`
**Look For:**
- ❓ Are PDF processing results properly formatted for frontend?
- ❓ Is the server returning data that can be reconciled?

---

## 🎯 **PRIMARY SUSPECTS FOR DATA FLOW BREAK**

### **Most Likely Issues:**
1. **Missing reconciler calls** in `claudeVisionProcessor.ts` or `serverPDFService.ts`
2. **Data not being saved** in `vehicleReconciler.ts` 
3. **loadVehicles() not loading** reconciled data in `App.tsx`
4. **Modal not calling parent callback** in `DocumentUploadModal.tsx`

### **Debug Steps:**
1. **Search for "reconciler"** in processing files (#1, #2, #7)
2. **Check localStorage** after processing (should see `vehicleReconciler_data`)
3. **Verify function calls** between modal → App → reconciler
4. **Check console logs** during document processing

---

## 🔄 **EXPECTED DATA FLOW**

```
Document Upload → Processing → Reconciliation → Storage → Display
       ↓              ↓            ↓           ↓         ↓
   Modal (#6)    Processor     Reconciler   localStorage  App (#4)
                (#1,#2,#7)       (#3)         (#3)      
                     ↓            ↓            ↓         ↓
                API Call    addDocument()  saveToStorage() loadVehicles()
```

**The break is likely between Processing → Reconciliation or Reconciliation → Display**

---

## 🚨 **CRITICAL QUESTIONS TO ANSWER**

1. ❓ Is `vehicleReconciler.addDocument()` being called after document processing?
2. ❓ Is data being saved to `localStorage['vehicleReconciler_data']`?
3. ❓ Is `reconcilerAPI.getAllVehicleSummaries()` returning the saved data?
4. ❓ Is `App.tsx` calling `loadVehicles()` after processing completes?

**Find the answers to these 4 questions and you'll find the break in the data flow!**
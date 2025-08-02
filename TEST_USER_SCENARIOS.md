# 🧪 TruckBo Test User Scenarios

## 👥 **Test User Profiles**

### **Profile 1: MegaTrans Solutions (Large Organized Fleet)**
**User:** `admin@sunbelttrucking.com` | **Password:** `admin123`

**Company Profile:**
- **Fleet Size:** 100 trucks, 100 drivers
- **Organization Level:** Highly organized, enterprise-level
- **Document Management:** Systematic naming conventions, proper categorization
- **Data Quality:** Clean, consistent, well-structured

**Test Folder:** `test-documents/large-fleet/`
- ✅ **Organized Structure:**
  - `drivers/` - CDL and medical certificates with clear naming (MTS-001, MTS-002, etc.)
  - `insurance/` - Insurance policies properly categorized
  - `registrations/` - Vehicle registrations with systematic numbering

**Testing Goals:**
- Validate bulk processing efficiency
- Test AI document classification accuracy with clean data
- Measure system performance with large datasets
- Verify compliance dashboard with organized fleet data

---

### **Profile 2: Chaos Freight Co (Small Disorganized Fleet)**
**User:** `admin@lonestarlogistics.com` | **Password:** `admin123`

**Company Profile:**
- **Fleet Size:** 15-20 trucks, 25 drivers
- **Organization Level:** Chaotic, small business
- **Document Management:** Random naming, mixed file types, poor organization
- **Data Quality:** Noisy data, inconsistent formats, random documents

**Test Folder:** `test-documents/small-fleet/mixed-docs/`
- ⚠️ **Chaotic Structure:**
  - Mixed document types in single folder
  - Random naming: `random_doc_1.html`, `misc_20.html`, `scan_18.html`
  - No clear categorization or systematic approach

**Testing Goals:**
- Test AI document classification with messy/unclear data
- Validate error handling for unrecognized documents
- Measure system resilience with poor data quality
- Test user experience with disorganized document uploads

---

## 🎯 **Testing Scenarios**

### **Scenario A: Organized Fleet Onboarding**
1. **Login as:** MegaTrans Solutions (`admin@sunbelttrucking.com`)
2. **Upload:** `test-documents/large-fleet/registrations/` folder
3. **Expected Results:**
   - High accuracy document classification
   - Efficient bulk processing
   - Clean data extraction
   - Proper vehicle fleet creation

### **Scenario B: Chaotic Fleet Challenge**
1. **Login as:** Chaos Freight Co (`admin@lonestarlogistics.com`)
2. **Upload:** `test-documents/small-fleet/mixed-docs/` folder
3. **Expected Results:**
   - System attempts to classify mixed documents
   - Some documents may be unrecognized
   - Error handling and user guidance
   - Demonstrates system robustness

### **Scenario C: Driver Documentation Comparison**
1. **Large Fleet:** Upload `test-documents/large-fleet/drivers/`
   - Organized CDL and medical certificates
   - Clear naming conventions
2. **Small Fleet:** Mixed driver docs in chaos folder
   - Test system's ability to identify driver documents among noise

---

## 📊 **Key Testing Metrics**

### **Document Processing Accuracy**
- **Large Fleet Expected:** 95%+ accuracy
- **Small Fleet Expected:** 70-85% accuracy (due to noise)

### **System Performance**
- **Large Fleet:** Bulk processing efficiency
- **Small Fleet:** Error handling and recovery

### **User Experience**
- **Large Fleet:** Smooth, efficient workflow
- **Small Fleet:** Helpful error messages and guidance

---

## 🚀 **How to Test**

1. **Access your live app:** https://truckbo-automation-1e8s9xsc2-sunils-projects-bbb21411.vercel.app

2. **Test Organized Fleet:**
   - Login: `admin@sunbelttrucking.com` / `admin123`
   - Navigate to Fleet Onboarding
   - Upload documents from `test-documents/large-fleet/`
   - Observe clean processing and high accuracy

3. **Test Chaotic Fleet:**
   - Login: `admin@lonestarlogistics.com` / `admin123` 
   - Navigate to Fleet Onboarding
   - Upload documents from `test-documents/small-fleet/mixed-docs/`
   - Observe how system handles messy data

4. **Compare Results:**
   - Document classification accuracy
   - Processing speed and efficiency
   - User experience and error handling
   - Compliance dashboard population

This testing approach validates TruckBo's versatility across different fleet management styles and data quality levels! 🚛✨
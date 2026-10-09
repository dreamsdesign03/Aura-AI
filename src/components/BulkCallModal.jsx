import { useState, useEffect, useRef } from "react";
import { X, PhoneOutgoing, Loader2, UploadCloud, Download, CheckCircle2, ChevronRight, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

function ProgressItem({ label, active, done }) {
  return (
    <div className={`flex items-center gap-3 text-sm ${active ? 'text-pink-600 font-medium' : (done ? 'text-green-600' : 'text-gray-400')}`}>
      {done ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : (active ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-4 h-4 border-2 border-gray-300 rounded-full"></div>)}
      <span>{label}</span>
    </div>
  );
}

function getProgressWidth(status) {
  switch(status) {
    case 'reading': return '20%';
    case 'parsing': return '40%';
    case 'detecting': return '60%';
    case 'validating': return '80%';
    case 'ready': return '100%';
    default: return '0%';
  }
}

export default function BulkCallModal({ isOpen, onClose, selectedLeads = [], onComplete }) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  
  // Settings state
  const [name, setName] = useState(`Bulk Campaign - ${format(new Date(), "dd MMM")}`);
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [retryDelayMin, setRetryDelayMin] = useState(60);
  const [gapSeconds, setGapSeconds] = useState(20);
  
  // Flow state
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  
  // Data state
  const [fileData, setFileData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({ name: "", phone: "", email: "", company: "" });
  const [previewData, setPreviewData] = useState([]);
  
  useEffect(() => {
    if (isOpen) {
      if (selectedLeads && selectedLeads.length > 0) {
        // Direct from leads
        const mapped = selectedLeads.map(l => ({
          name: [l.first_name, l.last_name].filter(Boolean).join(" ") || l.name,
          phone: l.phone || l.whatsapp,
          email: l.email,
          company: l.company,
          lead_id: l.id
        }));
        setPreviewData(mapped);
        setStep(4);
      } else {
        setStep(1);
        setFileData([]);
        setHeaders([]);
        setPreviewData([]);
        setMapping({ name: "", phone: "", email: "", company: "" });
        setUploadProgress(null);
      }
    }
  }, [isOpen, selectedLeads]);

  useEffect(() => {
    if (uploadProgress?.status === 'ready') {
      const timer = setTimeout(() => {
        console.log(`[BulkImport] Auto-advancing from step 1 to 2`);
        setStep(2);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [uploadProgress?.status]);

  useEffect(() => {
    if (isOpen) {
      console.log(`[BulkImport] Component mounted / modal opened (step: ${step}, campaign name: ${name})`);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const downloadSample = () => {
    const csvContent = "name,phone,email,company\nFake User 1,9999999999,fake1@example.com,Fake Corp\nFake User 2,9999999998,fake2@example.com,Fake LLC\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "bulk_call_sample.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processFile = async (file) => {
    console.group(`[BulkImport] Upload started for ${file.name}`);
    console.log(`[BulkImport] File selected: ${file.name}, size: ${(file.size/1024).toFixed(1)} KB, type: ${file.type}, lastModified: ${file.lastModified}`);
    
    setUploadProgress({
      fileName: file.name,
      fileSize: `${(file.size/1024).toFixed(1)} KB`,
      status: 'reading',
      rowsFound: 0,
      mappedCols: [],
      valid: 0,
      invalid: 0,
      dupes: 0,
      errorMsg: ''
    });
  
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let data = [];
      let fileHeaders = [];
      
      console.log(`[BulkImport] Extension detection result: ${ext}`);
      
      if (ext === 'csv') {
        console.log(`[BulkImport] Library load start (papaparse)`);
        const Papa = (await import('papaparse')).default;
        console.log(`[BulkImport] Library load end (papaparse loaded: ${!!Papa})`);
        
        console.log(`[BulkImport] File read start`);
        const startRead = performance.now();
        const text = await file.text();
        const cleanText = text.replace(/^\uFEFF/, '');
        console.log(`[BulkImport] File read end (${Math.round(performance.now() - startRead)}ms, ${cleanText.length} chars)`);
        
        setUploadProgress(p => ({ ...p, status: 'parsing' }));
        console.log(`[BulkImport] Parse start`);
        const startParse = performance.now();
        const parsed = Papa.parse(cleanText, { 
          header: true, 
          skipEmptyLines: "greedy",
          transformHeader: h => h.trim()
        });
        
        if (parsed.errors.length > 0) {
          console.warn(`[BulkImport] Parse warnings (Papa):`, parsed.errors);
        }
        
        data = parsed.data;
        if (data.length > 0) fileHeaders = Object.keys(data[0]);
        console.log(`[BulkImport] Parse end (${Math.round(performance.now() - startParse)}ms). Rows: ${data.length}`);
      } else if (ext === 'xlsx' || ext === 'xls') {
         console.log(`[BulkImport] Library load start (xlsx-js-style)`);
         const XLSX = await import('xlsx-js-style');
         console.log(`[BulkImport] Library load end (xlsx loaded: ${!!XLSX})`);
         
         console.log(`[BulkImport] File read start`);
         const startRead = performance.now();
         const buffer = await file.arrayBuffer();
         console.log(`[BulkImport] File read end (${Math.round(performance.now() - startRead)}ms, ${buffer.byteLength} bytes)`);
         
         setUploadProgress(p => ({ ...p, status: 'parsing' }));
         
         console.log(`[BulkImport] Parse start`);
         const startParse = performance.now();
         const wb = XLSX.read(buffer, { type: 'array' });
         console.log(`[BulkImport] Parse warnings (Sheet names):`, wb.SheetNames);
         const wsname = wb.SheetNames[0];
         data = XLSX.utils.sheet_to_json(wb.Sheets[wsname], { defval: "", raw: false });
         if (data.length > 0) fileHeaders = Object.keys(data[0]);
         console.log(`[BulkImport] Parse end (${Math.round(performance.now() - startParse)}ms). Rows: ${data.length}`);
      } else {
         throw new Error(`Unsupported file type: .${ext}. Please use .csv, .xlsx, or .xls`);
      }
      
      if (data.length === 0) throw new Error("File is empty");
      
      console.log(`[BulkImport] Headers list:`, fileHeaders);
      console.log(`[BulkImport] First 2 rows:`);
      console.table(data.slice(0, 2));
  
      setUploadProgress(p => ({ ...p, rowsFound: data.length, status: 'detecting' }));
      
      // Auto-detect mapping
      const autoMap = { name: "", phone: "", email: "", company: "" };
      fileHeaders.forEach(h => {
        const hl = h.toLowerCase().trim();
        if ((hl === 'name' || hl === 'full name' || hl === 'lead' || hl === 'contact name') && !autoMap.name) autoMap.name = h;
        if ((hl === 'phone' || hl === 'mobile' || hl === 'mobile no' || hl === 'contact' || hl === 'whatsapp' || hl === 'number') && !autoMap.phone) autoMap.phone = h;
        if ((hl === 'email' || hl === 'email id') && !autoMap.email) autoMap.email = h;
        if ((hl === 'company' || hl === 'clinic' || hl === 'business') && !autoMap.company) autoMap.company = h;
      });
      
      const unmappedCols = fileHeaders.filter(h => !Object.values(autoMap).includes(h));
      console.log(`[BulkImport] Column auto-detect result: name=${autoMap.name}, phone=${autoMap.phone}, email=${autoMap.email}, company=${autoMap.company}`);
      console.log(`[BulkImport] Unmapped columns:`, unmappedCols);
      
      const mappedColsList = Object.entries(autoMap).filter(([k,v]) => v).map(([k,v]) => `${k} -> ${v}`);
      setUploadProgress(p => ({ ...p, status: 'validating', mappedCols: mappedColsList }));
      
      let truncated = false;
      if (data.length > 500) {
        data = data.slice(0, 500);
        truncated = true;
      }
  
      let valid = 0, invalid = 0, dupes = 0;
      if (autoMap.phone) {
         let seen = new Set();
         data.forEach(r => {
             let raw = String(r[autoMap.phone] || "");
             let ph = raw.replace(/\D/g, '');
             let norm = "";
             if (ph.length === 10) norm = "+91" + ph;
             else if (ph.length === 12 && ph.startsWith("91")) norm = "+" + ph;
             else if (ph.length === 11 && ph.startsWith("0")) norm = "+91" + ph.slice(1);
             
             if (!norm) invalid++;
             else if (seen.has(norm)) dupes++;
             else {
               seen.add(norm);
               valid++;
             }
         });
      } else {
         invalid = data.length; // No phone column
      }
  
      console.log(`[BulkImport] Row validation summary: total=${data.length}, valid=${valid}, invalid=${invalid}, dupes=${dupes}, truncated to 500=${truncated}`);
      
      setFileData(data);
      setHeaders(fileHeaders);
      setMapping(autoMap);
      
      setUploadProgress(p => ({
        ...p,
        status: 'ready',
        valid,
        invalid,
        dupes
      }));
      
    } catch(err) {
      console.error("[BulkImport] ERROR at upload", err);
      setUploadProgress(p => ({ ...p, status: 'error', errorMsg: err.message }));
    } finally {
      console.groupEnd();
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); };
  const handleDragEnter = (e) => { e.preventDefault(); };
  const handleDrop = (e) => {
    e.preventDefault();
    console.log(`[BulkImport] Drop event fired. Files count: ${e.dataTransfer.files.length}`);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileInput = (e) => {
    console.log(`[BulkImport] Input onChange fired. Files length: ${e.target.files.length}`);
    const file = e.target.files[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const applyMapping = () => {
    if (!mapping.phone) {
      toast({ title: "Phone number column required", variant: "destructive" });
      return;
    }
    
    let validCount = 0;
    let invalidCount = 0;
    let dupesCount = 0;
    let seenPhones = new Set();

    const mapped = [];
    fileData.forEach(row => {
      let rawPhone = String(row[mapping.phone] || "");
      let ph = rawPhone.replace(/\D/g, '');
      let normalized = "";
      
      if (ph.length === 10) normalized = "+91" + ph;
      else if (ph.length === 12 && ph.startsWith("91")) normalized = "+" + ph;
      else if (ph.length === 11 && ph.startsWith("0")) normalized = "+91" + ph.slice(1);
      
      if (!normalized) {
        invalidCount++;
        return;
      }
      
      if (seenPhones.has(normalized)) {
        dupesCount++;
        return;
      }
      seenPhones.add(normalized);
      validCount++;

      const contact = {
        name: row[mapping.name] || "",
        phone: normalized,
        email: row[mapping.email] || "",
        company: row[mapping.company] || "",
        extra_json: {}
      };
      
      headers.forEach(h => {
        if (h !== mapping.name && h !== mapping.phone && h !== mapping.email && h !== mapping.company) {
          contact.extra_json[h] = row[h];
        }
      });
      
      mapped.push(contact);
    });
    
    if (mapped.length === 0) {
      toast({ title: "No valid contacts", description: "Found no rows with valid phone numbers", variant: "destructive" });
      return;
    }
    if (mapped.length > 500) {
      mapped.length = 500;
    }
    
    console.log(`[BulkImport] setStep transitions: from 2 to 3`);
    setPreviewData(mapped);
    setStep(3);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const payload = {
      name,
      max_attempts: maxAttempts,
      retry_delay_min: retryDelayMin,
      gap_seconds: gapSeconds,
      contacts: previewData
    };
    console.group(`[BulkImport] Campaign create click`);
    console.log(`[BulkImport] Payload summary: name=${name}, contacts=${previewData.length}, maxAttempts=${maxAttempts}, retryDelayMin=${retryDelayMin}, gapSeconds=${gapSeconds}`);
    
    try {
      const res = await fetch("/api/bulk-calling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      console.log(`[BulkImport] API response status: ${res.status}`);
      console.log(`[BulkImport] API response body:`, data);
      
      if (!res.ok) throw new Error(data.error || "Failed to create campaign");
      
      toast({ title: "Campaign created successfully!" });
      onComplete?.();
      onClose();
    } catch (err) {
      console.error("[BulkImport] ERROR at <create>", err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      console.groupEnd();
      setIsSubmitting(false);
    }
  };



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-pink-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm bg-pink-600">
              <PhoneOutgoing className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">New Bulk Campaign</h3>
              <div className="text-xs text-pink-700 font-medium flex items-center gap-2 mt-0.5">
                <span className={step >= 1 ? "font-bold" : "opacity-50"}>Upload</span> <ChevronRight className="w-3 h-3" />
                <span className={step >= 2 ? "font-bold" : "opacity-50"}>Map</span> <ChevronRight className="w-3 h-3" />
                <span className={step >= 3 ? "font-bold" : "opacity-50"}>Preview</span> <ChevronRight className="w-3 h-3" />
                <span className={step >= 4 ? "font-bold" : "opacity-50"}>Settings</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} disabled={isSubmitting} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Campaign Name</label>
                <input 
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-300 outline-none" 
                />
              </div>
              
              {!uploadProgress ? (
                <div 
                  className="border-2 border-dashed border-pink-200 rounded-2xl p-10 text-center hover:bg-pink-50/30 transition-colors relative"
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDrop={handleDrop}
                >
                  <UploadCloud className="w-12 h-12 text-pink-300 mx-auto mb-3" />
                  <h4 className="text-gray-800 font-bold mb-1">Upload Contacts List</h4>
                  <p className="text-xs text-gray-500 mb-6">Supports .csv and .xlsx files (Max 500 rows)</p>
                  
                  <input 
                    type="file" 
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleFileInput} 
                  />
                  <button 
                    onClick={() => {
                        console.log(`[BulkImport] Browse Files clicked; fileInputRef exists? ${!!fileInputRef.current}`);
                        fileInputRef.current?.click();
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-bold rounded-xl shadow-sm transition-all"
                  >
                    Browse Files
                  </button>
                  <p className="mt-4 text-[10px] text-gray-400 hover:text-gray-500 cursor-help" onClick={() => console.log('Check console for logs')}>
                    Open browser console (F12) and filter by [BulkImport]
                  </p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-2xl p-6 bg-gray-50">
                   <div className="flex justify-between items-center mb-4">
                     <div>
                       <h4 className="font-bold text-gray-800">{uploadProgress.fileName}</h4>
                       <p className="text-xs text-gray-500">{uploadProgress.fileSize}</p>
                     </div>
                     <button onClick={() => setUploadProgress(null)} className="p-1 text-gray-400 hover:text-gray-700"><X className="w-5 h-5"/></button>
                   </div>
                   
                   {uploadProgress.status === 'error' ? (
                     <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm mb-4">
                       <p className="font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Error</p>
                       <p className="mt-1">{uploadProgress.errorMsg}</p>
                       <button onClick={() => setUploadProgress(null)} className="mt-3 px-4 py-2 bg-red-100 hover:bg-red-200 rounded-lg text-red-800 font-semibold text-xs">Try another file</button>
                     </div>
                   ) : (
                     <div className="space-y-3">
                       <ProgressItem label="Reading file..." active={uploadProgress.status === 'reading'} done={['parsing','detecting','validating','ready'].includes(uploadProgress.status)} />
                       <ProgressItem label={`Parsing rows... ${uploadProgress.rowsFound ? `(${uploadProgress.rowsFound} rows found)` : ''}`} active={uploadProgress.status === 'parsing'} done={['detecting','validating','ready'].includes(uploadProgress.status)} />
                       <ProgressItem label={`Detecting columns... ${uploadProgress.mappedCols?.length ? `(${uploadProgress.mappedCols.join(', ')})` : ''}`} active={uploadProgress.status === 'detecting'} done={['validating','ready'].includes(uploadProgress.status)} />
                       <ProgressItem label={`Validating phone numbers... ${uploadProgress.status==='ready' ? `(${uploadProgress.valid} valid, ${uploadProgress.invalid} invalid, ${uploadProgress.dupes} dupes)` : ''}`} active={uploadProgress.status === 'validating'} done={uploadProgress.status === 'ready'} />
                       <ProgressItem label="Ready - moving to Map columns" active={false} done={uploadProgress.status === 'ready'} />
                       <div className="w-full bg-gray-200 h-1.5 rounded-full mt-4 overflow-hidden">
                          <div className={`bg-pink-600 h-full transition-all duration-300`} style={{ width: getProgressWidth(uploadProgress.status) }}></div>
                       </div>
                     </div>
                   )}
                </div>
              )}

              <div className="flex justify-center">
                <button type="button" onClick={downloadSample} className="flex items-center gap-2 text-xs font-medium text-pink-600 hover:text-pink-700">
                  <Download className="w-3.5 h-3.5" /> Download sample template
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm flex gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>We've detected {headers.length} columns in your file. Please map them to our system fields. <b>Phone is required.</b></p>
              </div>
              
              <div className="space-y-4">
                {['phone', 'name', 'email', 'company'].map(field => (
                  <div key={field} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl">
                    <span className="font-semibold text-gray-700 capitalize w-32">
                      {field} {field === 'phone' && <span className="text-red-500">*</span>}
                    </span>
                    <select 
                      value={mapping[field]} 
                      onChange={e => setMapping({...mapping, [field]: e.target.value})}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-pink-300 outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button onClick={() => { console.log(`[BulkImport] setStep transitions: from 2 to 1`); setStep(1); }} className="px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Back</button>
                <button onClick={applyMapping} className="px-5 py-2 bg-pink-600 text-white text-sm font-bold rounded-xl">Continue</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h4 className="font-bold text-gray-800 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Found {previewData.length} valid contacts
              </h4>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Name</th>
                      <th className="px-4 py-2 font-semibold">Phone</th>
                      <th className="px-4 py-2 font-semibold">Company</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewData.slice(0, 10).map((r, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2">{r.name || '-'}</td>
                        <td className="px-4 py-2">{r.phone}</td>
                        <td className="px-4 py-2">{r.company || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.length > 10 && <p className="text-xs text-center text-gray-500">Showing first 10 rows</p>}
              
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => { console.log(`[BulkImport] setStep transitions: from 3 to 2`); setStep(2); }} className="px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Back</button>
                <button onClick={() => { console.log(`[BulkImport] setStep transitions: from 3 to 4`); setStep(4); }} className="px-5 py-2 bg-pink-600 text-white text-sm font-bold rounded-xl">Continue to Settings</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              {(!selectedLeads || selectedLeads.length === 0) && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Campaign Name</label>
                  <input 
                    type="text" value={name} onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-300 outline-none" 
                  />
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Max Attempts per Contact</label>
                  <select 
                    value={maxAttempts} onChange={e => setMaxAttempts(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-1 focus:ring-pink-300 outline-none"
                  >
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1">If no answer or busy, we'll try up to {maxAttempts} times.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Retry Delay (minutes)</label>
                  <input 
                    type="number" min="5" value={retryDelayMin} onChange={e => setRetryDelayMin(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-1 focus:ring-pink-300 outline-none"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Wait this long before retrying a missed call.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Gap Between Calls (seconds)</label>
                  <input 
                    type="number" min="5" value={gapSeconds} onChange={e => setGapSeconds(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-1 focus:ring-pink-300 outline-none"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Pacing to avoid overwhelming agents.</p>
                </div>
              </div>

              <div className="bg-pink-50 p-4 rounded-xl border border-pink-100 flex items-center justify-between mt-4">
                <div>
                  <div className="font-bold text-pink-900">Ready to launch!</div>
                  <div className="text-xs text-pink-700 mt-1">{previewData.length} contacts will be added to this campaign.</div>
                </div>
                <button 
                  onClick={handleSubmit} 
                  disabled={isSubmitting} 
                  className="px-6 py-2.5 bg-pink-600 text-white font-bold rounded-xl shadow-md hover:bg-pink-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
              
              {(!selectedLeads || selectedLeads.length === 0) && (
                <button onClick={() => { console.log(`[BulkImport] setStep transitions: from 4 to 3`); setStep(3); }} className="text-sm font-medium text-gray-500 hover:text-gray-700 block text-center w-full">← Back</button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

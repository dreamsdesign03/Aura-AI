import { useState, useEffect } from "react";
import { X, PhoneOutgoing, Loader2, UploadCloud, Download, CheckCircle2, ChevronRight, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import * as XLSX from "xlsx-js-style";

export default function BulkCallModal({ isOpen, onClose, selectedLeads = [], onComplete }) {
  const { toast } = useToast();
  
  // Settings state
  const [name, setName] = useState(`Bulk Campaign - ${format(new Date(), "dd MMM")}`);
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [retryDelayMin, setRetryDelayMin] = useState(60);
  const [gapSeconds, setGapSeconds] = useState(20);
  
  // Flow state
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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
      }
    }
  }, [isOpen, selectedLeads]);

  if (!isOpen) return null;

  const downloadSample = () => {
    const ws = XLSX.utils.json_to_sheet([
      { name: "Rahul Sharma", phone: "9876543210", email: "rahul@example.com", company: "ABC Corp" },
      { name: "Priya Singh", phone: "919876543211", email: "priya@example.com", company: "XYZ Ltd" }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sample");
    XLSX.writeFile(wb, "bulk_call_sample.xlsx");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
        if (data.length === 0) throw new Error("File is empty");
        if (data.length > 500) throw new Error("Maximum 500 contacts allowed per campaign");
        
        setFileData(data);
        const fileHeaders = Object.keys(data[0]);
        setHeaders(fileHeaders);
        
        // Auto-detect mapping
        const autoMap = { name: "", phone: "", email: "", company: "" };
        fileHeaders.forEach(h => {
          const hl = h.toLowerCase();
          if (hl.includes('name') && !autoMap.name) autoMap.name = h;
          if ((hl.includes('phone') || hl.includes('mobile') || hl.includes('contact')) && !autoMap.phone) autoMap.phone = h;
          if (hl.includes('email') && !autoMap.email) autoMap.email = h;
          if (hl.includes('company') || hl.includes('business')) autoMap.company = h;
        });
        setMapping(autoMap);
        setStep(2);
      } catch (err) {
        toast({ title: "Error reading file", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
  };

  const applyMapping = () => {
    if (!mapping.phone) {
      toast({ title: "Phone number column required", variant: "destructive" });
      return;
    }
    const mapped = fileData.map(row => {
      const contact = {
        name: row[mapping.name] || "",
        phone: String(row[mapping.phone] || ""),
        email: row[mapping.email] || "",
        company: row[mapping.company] || "",
        extra_json: {}
      };
      // add remaining columns to extra
      headers.forEach(h => {
        if (h !== mapping.name && h !== mapping.phone && h !== mapping.email && h !== mapping.company) {
          contact.extra_json[h] = row[h];
        }
      });
      return contact;
    }).filter(c => c.phone.replace(/\D/g, '').length >= 10);
    
    if (mapped.length === 0) {
      toast({ title: "No valid contacts", description: "Found no rows with valid phone numbers", variant: "destructive" });
      return;
    }
    if (mapped.length > 500) {
      toast({ title: "Limit exceeded", description: "Max 500 contacts allowed", variant: "destructive" });
      return;
    }
    
    setPreviewData(mapped);
    setStep(3);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const payload = {
        name,
        max_attempts: maxAttempts,
        retry_delay_min: retryDelayMin,
        gap_seconds: gapSeconds,
        contacts: previewData
      };
      const res = await fetch("/api/bulk-calling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create campaign");
      
      toast({ title: "Campaign created successfully!" });
      onComplete?.();
      onClose();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
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
              
              <div className="border-2 border-dashed border-pink-200 rounded-2xl p-10 text-center hover:bg-pink-50/30 transition-colors">
                <UploadCloud className="w-12 h-12 text-pink-300 mx-auto mb-3" />
                <h4 className="text-gray-800 font-bold mb-1">Upload Contacts List</h4>
                <p className="text-xs text-gray-500 mb-6">Supports .csv and .xlsx files (Max 500 rows)</p>
                
                <input type="file" id="bulk-upload" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                <label htmlFor="bulk-upload" className="inline-flex items-center gap-2 px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-bold rounded-xl cursor-pointer shadow-sm transition-all">
                  Browse Files
                </label>
              </div>

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
                <button onClick={() => setStep(1)} className="px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Back</button>
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
                <button onClick={() => setStep(2)} className="px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Back</button>
                <button onClick={() => setStep(4)} className="px-5 py-2 bg-pink-600 text-white text-sm font-bold rounded-xl">Continue to Settings</button>
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
                <button onClick={() => setStep(3)} className="text-sm font-medium text-gray-500 hover:text-gray-700 block text-center w-full">← Back</button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

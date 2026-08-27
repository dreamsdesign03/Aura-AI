import { useState } from "react";
import { X, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getListLeadsQueryKey } from "@workspace/api-client-react";

const STAGE_OPTIONS = [
  { id: "new_enquiry", label: "New Enquiry" },
  { id: "enquiry_qualified", label: "Enquiry Qualified" },
  { id: "discovery_call", label: "Discovery Call" },
  { id: "quote_sent", label: "Quote / Est. Sent" },
  { id: "follow_up", label: "Follow Up / Negotiation" },
  { id: "project_won", label: "Project Won" },
  { id: "project_lost", label: "Project Lost" },
];

export default function AddLeadModal({ isOpen, onClose, initialStage = "new_enquiry", onSuccess }) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    whatsapp: "",
    linkedInUrl: "",
    photoUrl: "",
    company: "",
    companyLogo: "",
    city: "",
    country: "India",
    designation: "",
    website: "",
    industry: "",
    companySize: "",
    annualRevenue: "",
    dealValue: "",
    status: initialStage || "new_enquiry",
    source: "manual",
    keywords: "",
    notes: ""
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.firstName.trim()) {
      toast.error("First Name is required");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        firstName: formData.firstName.trim(),
        first_name: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        whatsapp: formData.whatsapp.trim() || formData.phone.trim(),
        company: formData.company.trim() || "Independent",
        companyLogo: formData.companyLogo.trim(),
        city: formData.city.trim(),
        country: formData.country.trim(),
        designation: formData.designation.trim(),
        website: formData.website.trim(),
        industry: formData.industry.trim(),
        companySize: formData.companySize,
        annualRevenue: formData.annualRevenue.trim(),
        deal_value: Number(formData.dealValue) || Number(formData.annualRevenue.replace(/[^0-9.]/g, "")) || 0,
        dealValue: Number(formData.dealValue) || Number(formData.annualRevenue.replace(/[^0-9.]/g, "")) || 0,
        status: formData.status,
        pipeline_stage: formData.status,
        source: formData.source,
        keywords: formData.keywords.trim(),
        notes: formData.notes.trim()
      };

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to create deal");
      }

      const created = await res.json();
      toast.success(`Deal created & stored in database!`);
      
      // Invalidate react query caches
      qc.invalidateQueries({ queryKey: ["leads-pipeline"] });
      qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
      qc.refetchQueries({ queryKey: ["leads-pipeline"] });
      
      onSuccess?.(created);
      onClose();
    } catch (err) {
      console.error("Create deal error:", err);
      toast.error(err.message || "Failed to save deal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="rounded-2xl border border-gray-200 w-full max-w-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-pink-50 flex items-center justify-center text-pink-600 font-bold">
              <Plus className="w-4 h-4"/>
            </div>
            <h2 className="text-sm font-bold text-gray-900">Add New Lead / Deal</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4"/>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">

          {/* ── Contact ── */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
              <span>CONTACT</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">First Name *</label>
                <input name="firstName" value={formData.firstName} onChange={handleChange} required placeholder="e.g. Rahul" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Last Name</label>
                <input name="lastName" value={formData.lastName} onChange={handleChange} placeholder="e.g. Sharma" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-[11px] text-gray-500 mb-1">Email *</label>
              <input name="email" type="email" value={formData.email} onChange={handleChange} required placeholder="rahul@example.com" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Phone *</label>
                <input name="phone" value={formData.phone} onChange={handleChange} required placeholder="+91 9876543210" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">WhatsApp Number</label>
                <input name="whatsapp" value={formData.whatsapp} onChange={handleChange} placeholder="+91 9876543210" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">LinkedIn URL</label>
                <input name="linkedInUrl" type="url" value={formData.linkedInUrl} onChange={handleChange} placeholder="https://" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Profile Photo URL</label>
                <input name="photoUrl" type="url" value={formData.photoUrl} onChange={handleChange} placeholder="https://" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
            </div>
          </div>

          {/* ── Company ── */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">COMPANY & DEAL</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Company Name *</label>
                <input name="company" value={formData.company} onChange={handleChange} required placeholder="e.g. Dreamsdesign Clinic" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Deal Amount / Value (₹)</label>
                <input name="dealValue" type="number" value={formData.dealValue} onChange={handleChange} placeholder="e.g. 50000" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Company Logo URL</label>
                <input name="companyLogo" type="url" value={formData.companyLogo} onChange={handleChange} placeholder="https://" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Pipeline Stage *</label>
                <select name="status" value={formData.status} onChange={handleChange} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300 font-semibold">
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">City</label>
                <input name="city" value={formData.city} onChange={handleChange} placeholder="e.g. Vadodara" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Country</label>
                <input name="country" value={formData.country} onChange={handleChange} placeholder="India" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Designation</label>
                <input name="designation" value={formData.designation} onChange={handleChange} placeholder="e.g. Founder / Director" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Website URL</label>
                <input name="website" type="url" value={formData.website} onChange={handleChange} placeholder="https://" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Industry</label>
                <input name="industry" value={formData.industry} onChange={handleChange} placeholder="e.g. Cosmetic Surgery" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Company Size</label>
                <select name="companySize" value={formData.companySize} onChange={handleChange} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300">
                  <option value="">Select…</option>
                  {["1-10", "11-50", "51-200", "201-500", "501-2000", "2000+"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Annual Revenue</label>
                <input name="annualRevenue" value={formData.annualRevenue} onChange={handleChange} placeholder="e.g. ₹50L" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
            </div>
          </div>

          {/* ── Classification ── */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">CLASSIFICATION & NOTES</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Lead Source *</label>
                <select name="source" value={formData.source} onChange={handleChange} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300">
                  {["manual", "linkedin", "cold-email", "referral", "event", "instagram", "website", "csv_import"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Keywords <span className="text-gray-400 font-normal">(comma-separated)</span></label>
                <input name="keywords" value={formData.keywords} onChange={handleChange} placeholder="e.g. branding, luxury, cosmetic" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-[11px] text-gray-500 mb-1">Notes</label>
              <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} placeholder="Add deal context, notes, or client requirements..." className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"/>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex gap-2 pt-3 border-t border-gray-100 sticky bottom-0 bg-white">
            <button type="button" onClick={onClose} className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 px-3 py-2 rounded-xl text-xs text-white font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-sm" style={{ background: "#A4285E" }}>
              {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/> Saving to Database…</> : "Save Deal to Database"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

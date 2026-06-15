import React, { useState, useRef, useEffect } from "react";
import { type FinancialEvidencePackage, type FinancialEvent, type FinancialCommitment } from "../types";
import { useFinancials } from "../context/FinancialRecordsContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useStorage } from "../context/StorageContext";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { AnimatePresence, motion } from "motion/react";
import {
  UploadCloud,
  FileText,
  CheckCircle,
  Link as LinkIcon,
  Trash2,
  Plus,
  Search,
  Eye,
  Link2,
  FileSpreadsheet,
  AlertCircle,
  X,
  ExternalLink,
  Filter,
  Paperclip,
  Check,
  Calendar,
  Building,
  DollarSign
} from "lucide-react";

export const FinancialEvidencePackageManager: React.FC = () => {
  const {
    financialEvents,
    financialCommitments,
    financialEvidencePackages,
    addFinancialEvidencePackage,
    editFinancialEvidencePackage,
    deleteFinancialEvidencePackage,
  } = useFinancials();

  const { activeWorkspace } = useWorkspace();
  const { isMockUser } = useAuth();
  const { activeProvider } = useStorage();

  // Selected state for previewing or editing packages
  const [selectedPackage, setSelectedPackage] = useState<FinancialEvidencePackage | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [linkFilter, setLinkFilter] = useState<string>("ALL"); // ALL, LINKED, UNLINKED

  // Generate safe signed URL for private bucket storage paths when selected
  useEffect(() => {
    if (!selectedPackage) {
      setFilePreviewUrl("");
      return;
    }

    if (
      !selectedPackage.fileUrl ||
      selectedPackage.fileUrl.startsWith("data:") ||
      selectedPackage.fileUrl.includes("photo-") ||
      !selectedPackage.fileUrl.includes("/storage/v1/object/")
    ) {
      setFilePreviewUrl(selectedPackage.fileUrl || "");
      return;
    }

    if (isSupabaseConfigured() && !isMockUser && supabase) {
      (async () => {
        try {
          const searchStr = "evidence-packages/";
          const idx = selectedPackage.fileUrl.indexOf(searchStr);
          let relativePath = "";
          if (idx !== -1) {
            relativePath = selectedPackage.fileUrl.substring(idx + searchStr.length);
          } else {
            relativePath = `${selectedPackage.workspaceId}/${selectedPackage.fileName}`;
          }

          if (relativePath) {
            const { data, error } = await supabase.storage
              .from("evidence-packages")
              .createSignedUrl(decodeURIComponent(relativePath), 3600); // 1-hour expiration

            if (!error && data?.signedUrl) {
              setFilePreviewUrl(data.signedUrl);
              return;
            } else if (error) {
              console.warn("Failed to generate signed preview URL:", error.message);
            }
          }
        } catch (err: any) {
          console.warn("Signed URL generation fallback exception:", err.message);
        }
        setFilePreviewUrl(selectedPackage.fileUrl);
      })();
    } else {
      setFilePreviewUrl(selectedPackage.fileUrl);
    }
  }, [selectedPackage, isMockUser]);

  // Upload fields state
  const [documentType, setDocumentType] = useState<"RECEIPT" | "INVOICE" | "STATEMENT" | "SUPPORTING_DOC">("RECEIPT");
  const [uploadNotes, setUploadNotes] = useState("");
  const [linkedEventId, setLinkedEventId] = useState<string>("");
  const [linkedCommitmentId, setLinkedCommitmentId] = useState<string>("");
  const [linkType, setLinkType] = useState<"TRANSACTION" | "COMMITMENT" | "NONE">("NONE");

  // Drag and drop hover indicator
  const [isDragging, setIsDragging] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Link modification modal/dropdown inside previewer
  const [isLinkingInPreview, setIsLinkingInPreview] = useState(false);
  const [previewLinkType, setPreviewLinkType] = useState<"TRANSACTION" | "COMMITMENT" | "NONE">("NONE");
  const [previewLinkId, setPreviewLinkId] = useState("");

  // Clean error texts after 5 seconds
  useEffect(() => {
    if (errorText) {
      const timer = setTimeout(() => setErrorText(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorText]);

  useEffect(() => {
    if (successText) {
      const timer = setTimeout(() => setSuccessText(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successText]);

  // Drag handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  // Central File Processing Routine
  const processFile = async (file: File) => {
    if (!activeWorkspace) {
      setErrorText("No active workspace selected.");
      return;
    }

    // Limit size check (10MB for safety)
    if (file.size > 10 * 1024 * 1024) {
      setErrorText("File size exceeds 10MB limit.");
      return;
    }

    setIsUploading(true);
    setErrorText(null);
    setSuccessText(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const dataUrl = e.target?.result as string;
        let finalUrl = dataUrl;

        // Provider-aware routing check: If cloud provider BYOS is active, only record metadata
        const isBYOSActive = activeProvider && activeProvider.providerType !== "HQ_MANAGED" && activeProvider.connectionStatus === "CONNECTED";

        if (isBYOSActive) {
          const fileExt = file.name.split(".").pop();
          const cleanName = file.name.replace(/[^a-zA-Z0-9]/g, "_");
          const slug = activeWorkspace.slug || activeWorkspace.id.substring(0, 8);
          // Set a clean BYOS reference URL - MYKERANI stores only metadata
          finalUrl = `${activeProvider.providerType.toLowerCase()}://byos-vault/${slug}/${Date.now()}_${cleanName}.${fileExt}`;
        } else if (isSupabaseConfigured() && !isMockUser && supabase) {
          // Try direct upload to Supabase Storage if integrated and configured
          try {
            const fileExt = file.name.split(".").pop();
            const cleanName = file.name.replace(/[^a-zA-Z0-9]/g, "_");
            const filePath = `${activeWorkspace.id}/${Date.now()}_${cleanName}.${fileExt}`;

            // Attempt bucket upload
            const { data, error: storageError } = await supabase.storage
              .from("evidence-packages")
              .upload(filePath, file, { cacheControl: "3600", upsert: true });

            if (storageError) {
              console.warn(
                "Bucket upload failed. Falling back to DB image data encoding:",
                storageError.message
              );
            } else if (data) {
              const { data: { publicUrl } } = supabase.storage
                .from("evidence-packages")
                .getPublicUrl(filePath);
              if (publicUrl) {
                finalUrl = publicUrl;
              }
            }
          } catch (stEx: any) {
            console.warn("Storage upload exception, using fallback:", stEx.message);
          }
        }

        // Determine relation linkages
        let finalRelType: string | undefined = undefined;
        let finalRelId: string | undefined = undefined;

        if (linkType === "TRANSACTION" && linkedEventId) {
          const matchedEv = financialEvents.find((ev) => ev.id === linkedEventId);
          if (matchedEv) {
            finalRelType = matchedEv.type; // INCOME, EXPENSE, RECEIVABLE, PAYABLE, DEBT
            finalRelId = linkedEventId;
          }
        } else if (linkType === "COMMITMENT" && linkedCommitmentId) {
          finalRelType = "COMMITMENT";
          finalRelId = linkedCommitmentId;
        }

        const newPackage = addFinancialEvidencePackage({
          workspaceId: activeWorkspace.id,
          documentType,
          uploadDate: new Date().toISOString().split("T")[0],
          fileName: file.name,
          fileUrl: finalUrl,
          relatedRecordType: finalRelType,
          relatedRecordId: finalRelId,
          notes: uploadNotes.trim() || undefined,
        });

        setSuccessText(`Successfully uploaded and created ${file.name}`);
        setUploadNotes("");
        setLinkType("NONE");
        setLinkedEventId("");
        setLinkedCommitmentId("");
        
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } catch (err: any) {
        setErrorText(`Upload failed: ${err.message}`);
      } finally {
        setIsUploading(false);
      }
    };

    reader.onerror = () => {
      setErrorText("Could not read file binary.");
      setIsUploading(false);
    };

    reader.readAsDataURL(file);
  };

  // Helper resolvers to show rich details of what records are linked!
  const getLinkedRecordDetails = (pkg: FinancialEvidencePackage) => {
    if (!pkg.relatedRecordId || !pkg.relatedRecordType) return null;

    if (pkg.relatedRecordType === "COMMITMENT") {
      const commitment = financialCommitments.find((c) => c.id === pkg.relatedRecordId);
      return commitment
        ? {
            title: commitment.description,
            sub: `Obligee: ${commitment.obligeeName} | Recurrence: ${commitment.recurrence}`,
            amount: commitment.amountPerIntervalMyr,
            badge: "COMMITMENT",
            color: "indigo"
          }
        : null;
    } else {
      // It is a financialEvent
      const event = financialEvents.find((e) => e.id === pkg.relatedRecordId);
      return event
        ? {
            title: `${event.categoryName} (${event.partyName})`,
            sub: `Date: ${event.date} | Ref: ${event.referenceNumber}`,
            amount: event.amountMyr,
            badge: event.type,
            color:
              event.type === "INCOME"
                ? "emerald"
                : event.type === "EXPENSE"
                ? "rose"
                : event.type === "RECEIVABLE"
                ? "blue"
                : event.type === "PAYABLE"
                ? "amber"
                : "purple"
          }
        : null;
    }
  };

  // Set linking in inside the Preview Side Over
  const handleApplyPreviewLink = () => {
    if (!selectedPackage) return;

    let finalRelType: string | undefined = undefined;
    let finalRelId: string | undefined = undefined;

    if (previewLinkType === "TRANSACTION" && previewLinkId) {
      const matched = financialEvents.find((e) => e.id === previewLinkId);
      if (matched) {
        finalRelType = matched.type;
        finalRelId = previewLinkId;
      }
    } else if (previewLinkType === "COMMITMENT" && previewLinkId) {
      finalRelType = "COMMITMENT";
      finalRelId = previewLinkId;
    }

    editFinancialEvidencePackage(selectedPackage.id, {
      relatedRecordType: finalRelType,
      relatedRecordId: finalRelId,
    });

    // Update locally too
    setSelectedPackage({
      ...selectedPackage,
      relatedRecordType: finalRelType,
      relatedRecordId: finalRelId,
    });

    setIsLinkingInPreview(false);
    setSuccessText("Successfully linked file.");
  };

  const handleRemovePreviewLink = () => {
    if (!selectedPackage) return;

    editFinancialEvidencePackage(selectedPackage.id, {
      relatedRecordType: undefined,
      relatedRecordId: undefined,
    });

    setSelectedPackage({
      ...selectedPackage,
      relatedRecordType: undefined,
      relatedRecordId: undefined,
    });

    setSuccessText("Successfully unlinked file.");
  };

  // Filter list
  const filteredEvidence = financialEvidencePackages.filter((pkg) => {
    // 1. Workspace Isolation
    if (activeWorkspace && pkg.workspaceId !== activeWorkspace.id) return false;

    // 2. Search query
    const matchSearch =
      pkg.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pkg.notes && pkg.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    // 3. Document type
    const matchType = typeFilter === "ALL" || pkg.documentType === typeFilter;

    // 4. Link filter
    let matchLink = true;
    if (linkFilter === "LINKED") {
      matchLink = !!pkg.relatedRecordId;
    } else if (linkFilter === "UNLINKED") {
      matchLink = !pkg.relatedRecordId;
    }

    return matchSearch && matchType && matchLink;
  });

  return (
    <div className="space-y-8" id="financial_evidence_package_module">
      
      {/* 2-COLUMN UPLOADER AND STATS BOX */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="evidence_top_dashboard_grid">
        
        {/* DRAG-AND-DROP UPLOAD FORM SECTION */}
        <div className="lg:col-span-2 bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5" id="evidence_creation_panel">
          <div className="flex items-center space-x-2">
            <Paperclip className="w-5 h-5 text-slate-700" />
            <h4 className="font-display font-semibold text-sm text-slate-800">
              Inbound Financial Evidence Pipeline
            </h4>
          </div>

          {/* Active Isolated Storage Target Info Banner */}
          <div className="p-3 bg-white border border-slate-150 rounded-xl flex items-center justify-between text-2xs text-slate-600 font-mono">
            <span className="flex items-center space-x-1.5 font-sans font-medium text-slate-500">
              <span className={`w-1.5 h-1.5 rounded-full ${activeProvider?.connectionStatus === "CONNECTED" ? "bg-emerald-550 animate-pulse" : "bg-amber-400"}`} />
              <span>Target Storage Routing:</span>
            </span>
            <span className="font-semibold text-slate-800 uppercase">
              {activeProvider?.providerType === "HQ_MANAGED"
                ? `HQ Managed (${activeWorkspace?.slug || activeWorkspace?.id.substring(0, 8)}/)`
                : `${activeProvider?.providerType || "HQ Managed"} (${activeWorkspace?.slug || activeWorkspace?.id.substring(0, 8)}/)`}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="upload_metadata_form_inputs">
            {/* Document Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5" id="lbl_doc_type">
                Document Classification
              </label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-hidden text-slate-800 focus:border-slate-800"
                id="inp_evidence_doc_type"
              >
                <option value="RECEIPT">🧾 Corporate Expense Receipt</option>
                <option value="INVOICE">📄 Vendor Billing Invoice</option>
                <option value="STATEMENT">🏦 Bank Depository Statement</option>
                <option value="SUPPORTING_DOC">📎 Miscellaneous Supporting Document</option>
              </select>
            </div>

            {/* Linkage selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5" id="lbl_link_type">
                Associate / Link with Financial Ledger Item
              </label>
              <select
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-hidden text-slate-800 focus:border-slate-800"
                id="inp_evidence_link_selector"
              >
                <option value="NONE">- Leave Unlinked (File Standalone) -</option>
                <option value="TRANSACTION">🔗 Link with Income, Expense or Debts</option>
                <option value="COMMITMENT">📅 Link with recurring Contract Commitment</option>
              </select>
            </div>
          </div>

          {/* Conditional dropdown to choose records */}
          {linkType === "TRANSACTION" && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-100 rounded-xl p-3"
            >
              <label className="block text-xs font-semibold text-slate-600 mb-1" id="lbl_linked_event">
                Choose Specific transaction
              </label>
              <select
                value={linkedEventId}
                onChange={(e) => setLinkedEventId(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 outline-hidden text-slate-800"
                id="inp_linked_event_id"
              >
                <option value="">- Pick transaction -</option>
                {financialEvents
                  .filter((ev) => ev.workspaceId === activeWorkspace?.id)
                  .map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      [{ev.type}] {ev.date} - {ev.partyName} - MYR {ev.amountMyr.toFixed(2)} ({ev.categoryName})
                    </option>
                  ))}
              </select>
            </motion.div>
          )}

          {linkType === "COMMITMENT" && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-100 rounded-xl p-3"
            >
              <label className="block text-xs font-semibold text-slate-600 mb-1" id="lbl_linked_commitment">
                Choose recurrent Commitment
              </label>
              <select
                value={linkedCommitmentId}
                onChange={(e) => setLinkedCommitmentId(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 outline-hidden text-slate-800"
                id="inp_linked_commitment_id"
              >
                <option value="">- Pick commitment contract -</option>
                {financialCommitments
                  .filter((cm) => cm.workspaceId === activeWorkspace?.id)
                  .map((cm) => (
                    <option key={cm.id} value={cm.id}>
                      {cm.description} - {cm.obligeeName} (MYR {cm.amountPerIntervalMyr.toFixed(2)} {cm.recurrence})
                    </option>
                  ))}
              </select>
            </motion.div>
          )}

          {/* Notes description Area */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5" id="lbl_notes">
              Audit Notes & Classify Remarks
            </label>
            <textarea
              rows={2}
              value={uploadNotes}
              onChange={(e) => setUploadNotes(e.target.value)}
              placeholder="Provide context, compliance stamps, approved managers, or clearing details..."
              className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 outline-hidden text-slate-800 focus:border-slate-800 resize-none font-sans"
              id="inp_upload_notes"
            ></textarea>
          </div>

          {/* Drag and drop core interaction staging area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer group relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all ${
              isDragging
                ? "border-slate-930 bg-slate-100 scale-[0.99]"
                : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-400"
            }`}
            id="drag_drop_sensor_area"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.doc,.docx"
              id="inp_raw_local_file_input"
            />

            {isUploading ? (
              <div className="space-y-2 py-4" id="uploading_spinner_box">
                <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs font-semibold text-slate-700 font-sans" id="txt_stg_sending">
                  Injecting Evidence Package. Please wait while uploading...
                </p>
              </div>
            ) : (
              <div className="space-y-3 py-3" id="fallback_idle_prompt">
                <div className="mx-auto w-12 h-12 bg-slate-100 group-hover:bg-slate-200 text-slate-600 rounded-full flex items-center justify-center transition">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800 font-sans">
                    Drag & Drop file here, or <span className="text-slate-950 underline font-bold group-hover:text-slate-999">browse local files</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Supports JPG, PNG, WEBP, PDF, CSV up to 10MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Toast style notices */}
          {errorText && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center space-x-2 bg-rose-50 border border-rose-100 text-rose-700 p-3 rounded-xl text-xs font-semibold"
            >
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{errorText}</span>
            </motion.div>
          )}

          {successText && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center space-x-2 bg-emerald-50 border border-emerald-100 text-emerald-700 p-3 rounded-xl text-xs font-semibold"
            >
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{successText}</span>
            </motion.div>
          )}
        </div>

        {/* EVIDENCE STORAGE METRIC SIDEBAR */}
        <div className="bg-slate-900 text-white rounded-2xl p-6 flex flex-col justify-between space-y-6" id="evidence_stats_sidebar">
          <div className="space-y-4">
            <h4 className="font-display font-semibold text-sm tracking-wide text-slate-300">
              Audit Compliance Overview
            </h4>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              In MYKERANI system ledger context, **Financial Evidence Packages** verify the validity of cashflows, payables settlement, and operational commitments in line with isolation policy criteria.
            </p>

            <div className="pt-2 divide-y divide-slate-800 space-y-3.5">
              <div className="flex justify-between items-center pt-2">
                <span className="text-xs text-slate-400">Total Enrolled Records</span>
                <span className="text-xs font-mono font-bold bg-slate-800 px-2 py-0.5 rounded-sm">
                  {financialEvidencePackages.filter((p) => p.workspaceId === activeWorkspace?.id).length}
                </span>
              </div>
              <div className="flex justify-between items-center pt-3">
                <span className="text-xs text-slate-400">Linked to Ledger</span>
                <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded-sm">
                  {financialEvidencePackages.filter((p) => p.workspaceId === activeWorkspace?.id && p.relatedRecordId).length}
                </span>
              </div>
              <div className="flex justify-between items-center pt-3">
                <span className="text-xs text-slate-400">Unlinked / Pending Review</span>
                <span className="text-xs font-mono text-amber-400 font-bold bg-amber-950/40 px-2 py-0.5 rounded-sm">
                  {financialEvidencePackages.filter((p) => p.workspaceId === activeWorkspace?.id && !p.relatedRecordId).length}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3.5 space-y-1.5 text-[10px] text-slate-400 font-sans">
            <div className="flex items-center text-slate-300 font-semibold mb-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 mr-1 shrink-0" />
              Tenant & Workspace Isolated
            </div>
            All uploaded receipts, invoices, and statements are fully scoped to your workspace context (`{activeWorkspace?.name}`). Row-level security blocks all lateral tenant extraction or visibility cross-talk.
          </div>
        </div>
      </div>

      {/* FILTER SEARCH DIRECTORY SHEARED SECTION */}
      <div className="space-y-4" id="evidence_grid_explorer_canvas">
        <div className="flex flex-col md:flex-row gap-3 justify-between items-start md:items-center">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search evidence package files by name, metadata flags or classifying notes..."
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 outline-hidden text-slate-800 focus:bg-white focus:border-slate-900 transition"
              id="inp_evidence_search_query"
            />
          </div>
          
          <div className="flex flex-wrap gap-2 w-full md:w-auto" id="evidence_filters_alignment">
            {/* Filter by classification */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-hidden text-slate-700"
              id="inp_type_filter_pulldown"
            >
              <option value="ALL">📋 All Classifications</option>
              <option value="RECEIPT">🧾 Receipts</option>
              <option value="INVOICE">📄 Invoices</option>
              <option value="STATEMENT">🏦 Statements</option>
              <option value="SUPPORTING_DOC">📎 Supporting Docs</option>
            </select>

            {/* Filter by linkages */}
            <select
              value={linkFilter}
              onChange={(e) => setLinkFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-hidden text-slate-700"
              id="inp_link_filter_pulldown"
            >
              <option value="ALL">🔗 All Connections</option>
              <option value="LINKED">🟢 Linked to Ledger</option>
              <option value="UNLINKED">⚪ Unlinked Standalone</option>
            </select>
          </div>
        </div>

        {/* EVIDENCE MAIN MATRIX DIRECTORY */}
        {filteredEvidence.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-100 bg-white rounded-2xl" id="evidence_empty_billboard">
            <Paperclip className="w-10 h-10 text-slate-300 mx-auto animate-bounce mb-3" />
            <h5 className="font-display font-medium text-slate-700 text-sm">
              No matching Financial Evidence Packages
            </h5>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto font-sans">
              No files matched your search or filter configuration. Upload or drop a new document above to start verifying your ledger.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="evidence_packages_visual_bento">
            {filteredEvidence.map((pkg) => {
              const linkage = getLinkedRecordDetails(pkg);
              return (
                <motion.div
                  key={pkg.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all rounded-2xl p-5 flex flex-col justify-between space-y-4"
                  id={`evidence_card_${pkg.id}`}
                >
                  <div className="space-y-3">
                    {/* Header: Type and Action Icon */}
                    <div className="flex justify-between items-center">
                      <span
                        className={`text-[9px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full ${
                          pkg.documentType === "RECEIPT"
                            ? "bg-rose-50 text-rose-700 border border-rose-100"
                            : pkg.documentType === "INVOICE"
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                            : pkg.documentType === "STATEMENT"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-slate-50 text-slate-600 border border-slate-100"
                        }`}
                      >
                        {pkg.documentType.replace("_", " ")}
                      </span>
                      
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => setSelectedPackage(pkg)}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition cursor-pointer"
                          title="Preview Evidence Item"
                          id={`btn_preview_${pkg.id}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteFinancialEvidencePackage(pkg.id)}
                          className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition cursor-pointer"
                          title="Purge Evidence File"
                          id={`btn_purge_${pkg.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* File Meta info */}
                    <div>
                      <h5 className="text-xs font-semibold text-slate-900 truncate font-sans" title={pkg.fileName}>
                        {pkg.fileName}
                      </h5>
                      <span className="flex items-center text-[10px] text-slate-400 mt-1">
                        <Calendar className="w-3 h-3 mr-1 text-slate-400" />
                        Uploaded: {pkg.uploadDate}
                      </span>
                    </div>

                    {/* Notes preview clip */}
                    {pkg.notes && (
                      <p className="text-[11px] text-slate-500 italic font-sans line-clamp-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        "{pkg.notes}"
                      </p>
                    )}
                  </div>

                  {/* Association Indicator (Bottom portion of card) */}
                  <div className="border-t border-slate-100 pt-3">
                    {linkage ? (
                      <div
                        onClick={() => setSelectedPackage(pkg)}
                        className="p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-start space-x-2 scroll-py-1 text-left overflow-hidden">
                          <Link2 className="w-3.5 h-3.5 mt-0.5 text-slate-500 shrink-0" />
                          <div className="overflow-hidden">
                            <span className="text-[9px] font-bold text-slate-500 block uppercase tracking-wide">
                              Linked Connection ({linkage.badge})
                            </span>
                            <span className="text-[11px] font-semibold text-slate-800 block truncate font-sans">
                              {linkage.title}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-900 shrink-0 pl-1">
                          RM {linkage.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    ) : (
                      <div className="text-center py-1">
                        <button
                          onClick={() => {
                            setSelectedPackage(pkg);
                            setIsLinkingInPreview(true);
                          }}
                          className="mx-auto text-[10px] text-slate-500 hover:text-slate-900 hover:underline font-bold flex items-center space-x-1 cursor-pointer"
                          id={`btn_link_init_${pkg.id}`}
                        >
                          <LinkIcon className="w-3 h-3 text-slate-400 mr-1" />
                          Link to Ledger Record
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* FULL EVIDENCE PREVIEW SIDE OVERLAY DRAWER */}
      <AnimatePresence>
        {selectedPackage && (
          <div className="fixed inset-0 z-50 overflow-hidden flex justify-end" id="drawer_backdrop_layer">
            {/* Backdrop dark overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSelectedPackage(null);
                setIsLinkingInPreview(false);
              }}
              className="absolute inset-0 bg-slate-900"
            />

            {/* Main Side Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto"
              id="evidence_preview_drawer"
            >
              {/* Header */}
              <div className="border-b border-slate-100 p-5 flex justify-between items-center bg-slate-50">
                <div className="space-y-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-100">
                    {selectedPackage.documentType} Package Verification
                  </span>
                  <h4 className="font-display font-bold text-slate-900 text-sm truncate max-w-[340px]">
                    {selectedPackage.fileName}
                  </h4>
                </div>
                <button
                  onClick={() => {
                    setSelectedPackage(null);
                    setIsLinkingInPreview(false);
                  }}
                  className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-xl cursor-pointer"
                  id="btn_close_drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Central Content */}
              <div className="p-6 space-y-6 flex-1">
                {/* Visual File Preview Box */}
                <div className="bg-slate-100 border border-slate-200 rounded-2xl min-h-[220px] max-h-[300px] flex items-center justify-center overflow-hidden relative shadow-inner">
                  {filePreviewUrl &&
                  (filePreviewUrl.startsWith("data:image/") ||
                    filePreviewUrl.includes("photo-") ||
                    filePreviewUrl.includes("token=") || // Signed URL token identifier
                    filePreviewUrl.endsWith(".jpg") ||
                    filePreviewUrl.endsWith(".jpeg") ||
                    filePreviewUrl.endsWith(".png") ||
                    filePreviewUrl.endsWith(".webp")) ? (
                    <img
                      src={filePreviewUrl}
                      alt={selectedPackage.fileName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      id="loaded_image_tag"
                    />
                  ) : (
                    <div className="text-center space-y-3 p-8">
                      <div className="w-12 h-12 bg-white rounded-2xl border border-slate-200 text-slate-500 flex items-center justify-center mx-auto shadow-xs">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">
                          Non-Image Document Format
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          File reference is safely buffered in isolated storage.
                        </p>
                      </div>
                      <a
                        href={filePreviewUrl}
                        download={selectedPackage.fileName}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-xs text-slate-950 font-bold bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50"
                        id="btn_download_external"
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        External Fullscreen View
                      </a>
                    </div>
                  )}
                </div>

                {/* Metadata list */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 font-sans">
                  <h5 className="text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                    Evidence Metadata Elements
                  </h5>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">Unique Voucher ID</span>
                      <span className="font-mono text-[11px] text-slate-800 bg-white border border-slate-100 px-1.5 py-0.5 rounded-sm block truncate">
                        {selectedPackage.id}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">Submission Date</span>
                      <span className="text-slate-800 font-medium block">
                        {selectedPackage.uploadDate}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">Classification Tag</span>
                      <span className="text-slate-800 font-medium block">
                        {selectedPackage.documentType.replace("_", " ")}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">Workspace Origin</span>
                      <span className="text-slate-800 font-medium block">
                        {activeWorkspace?.name} ({activeWorkspace?.slug})
                      </span>
                    </div>
                    {selectedPackage.notes && (
                      <div className="col-span-2">
                        <span className="text-[10px] text-slate-400 block mb-0.5">Clearing Audit Notes</span>
                        <div className="bg-white border border-slate-100 rounded-lg p-2.5 text-xs text-slate-600 italic">
                          "{selectedPackage.notes}"
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Link modification foundation wrapper */}
                <div className="border-t border-slate-150 pt-5 space-y-4">
                  <div className="flex justify-between items-center">
                    <h5 className="font-display font-semibold text-xs text-slate-800">
                      Ledger Association Foundation
                    </h5>
                    {selectedPackage.relatedRecordId && (
                      <button
                        onClick={handleRemovePreviewLink}
                        className="text-[10px] text-red-600 hover:text-red-800 font-semibold flex items-center space-x-1 cursor-pointer"
                        id="btn_remove_link"
                      >
                        <X className="w-3 h-3 mr-0.5" />
                        Unlink / Disassociate file
                      </button>
                    )}
                  </div>

                  {selectedPackage.relatedRecordId ? (
                    // Display resolved mapping details
                    (() => {
                      const mapping = getLinkedRecordDetails(selectedPackage);
                      if (!mapping) return null;
                      return (
                        <div className="p-4 bg-emerald-50/40 border border-emerald-100 rounded-2xl flex items-center justify-between">
                          <div className="space-y-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-sm">
                              {mapping.badge} Bound Connection
                            </span>
                            <p className="text-xs font-semibold text-slate-800 font-sans">
                              {mapping.title}
                            </p>
                            <p className="text-[10px] text-slate-400 font-sans">
                              {mapping.sub}
                            </p>
                          </div>
                          <span className="text-xs font-mono font-extrabold text-slate-900 bg-white border border-slate-100 px-2.5 py-1.5 rounded-xl">
                            RM {mapping.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      );
                    })()
                  ) : (
                    // Staged linking inline inputs
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 font-sans" id="staged_linking_area">
                      {!isLinkingInPreview ? (
                        <div className="text-center py-2">
                          <button
                            onClick={() => {
                              setIsLinkingInPreview(true);
                              setPreviewLinkType("NONE");
                              setPreviewLinkId("");
                            }}
                            className="text-xs font-bold text-slate-950 bg-white border border-slate-250 hover:bg-slate-50 px-4 py-2 rounded-xl transition cursor-pointer inline-flex items-center space-x-1"
                            id="btn_enable_link"
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Build Dynamic Ledger Linkage
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                Link Ledger Record Type
                              </label>
                              <select
                                value={previewLinkType}
                                onChange={(e) => {
                                  setPreviewLinkType(e.target.value as any);
                                  setPreviewLinkId("");
                                }}
                                className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 outline-hidden text-slate-800"
                                id="inp_preview_link_type"
                              >
                                <option value="NONE">Select classification...</option>
                                <option value="TRANSACTION">Transaction Ledger</option>
                                <option value="COMMITMENT">Recurring Commitment</option>
                              </select>
                            </div>

                            {previewLinkType !== "NONE" && (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                  Choose Target Record
                                </label>
                                <select
                                  value={previewLinkId}
                                  onChange={(e) => setPreviewLinkId(e.target.value)}
                                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-2 outline-hidden text-slate-800"
                                  id="inp_preview_link_target"
                                >
                                  <option value="">Choose item...</option>
                                  {previewLinkType === "TRANSACTION"
                                    ? financialEvents
                                        .filter((e) => e.workspaceId === activeWorkspace?.id)
                                        .map((e) => (
                                          <option key={e.id} value={e.id}>
                                            {e.date} - {e.partyName} (RM {e.amountMyr.toFixed(2)})
                                          </option>
                                        ))
                                    : financialCommitments
                                        .filter((cm) => cm.workspaceId === activeWorkspace?.id)
                                        .map((cm) => (
                                          <option key={cm.id} value={cm.id}>
                                            {cm.description} - {cm.obligeeName} (RM {cm.amountPerIntervalMyr})
                                          </option>
                                        ))}
                                </select>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2 justify-end pt-1">
                            <button
                              onClick={() => setIsLinkingInPreview(false)}
                              className="text-xs font-semibold px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer text-slate-700"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleApplyPreviewLink}
                              disabled={previewLinkType === "NONE" || !previewLinkId}
                              className="text-xs font-semibold px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer disabled:opacity-40"
                              id="btn_confirm_preview_link"
                            >
                              Confirm Linkage
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom footer action */}
              <div className="border-t border-slate-100 p-5 bg-slate-50 flex justify-end">
                <button
                  onClick={() => {
                    setSelectedPackage(null);
                    setIsLinkingInPreview(false);
                  }}
                  className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition cursor-pointer"
                  id="btn_drawer_done"
                >
                  Close Panel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

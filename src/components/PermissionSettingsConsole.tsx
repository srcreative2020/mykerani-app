import React, { useState } from "react";
import { usePermission } from "../context/PermissionContext";
import { useAuth } from "../context/AuthContext";
import { type UserRole, type ModuleName, type ModulePermissions } from "../types";
import { 
  ShieldAlert, 
  ShieldCheck, 
  UserPlus, 
  UserX, 
  FolderLock, 
  Settings, 
  Users, 
  ToggleLeft, 
  Check, 
  X, 
  Key, 
  Building,
  RefreshCw,
  Lock,
  Unlock,
  AlertTriangle
} from "lucide-react";

export const PermissionSettingsConsole: React.FC = () => {
  const { user, isMockUser } = useAuth();
  const { 
    userRoles, 
    permissionMatrix, 
    loading, 
    assignUserRole,
    removeUserAssignment,
    setUserAssignmentSuspended,
    updateMatrixCell,
    canManageWorkspaces,
    canManageTenants
  } = usePermission();

  const [activeTab, setActiveTab] = useState<"matrix" | "assignments" | "visualizer">("matrix");

  // Form states for creating new assignment
  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("TENANT_STAFF");
  const [submittingUser, setSubmittingUser] = useState(false);
  const [formMsg, setFormMsg] = useState("");

  const editRights = ["HQ_OWNER", "TENANT_OWNER"].includes(user?.role || "");

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newFullName) return;
    setSubmittingUser(true);
    setFormMsg("");
    try {
      await assignUserRole(newEmail, newFullName, selectedRole);
      setNewEmail("");
      setNewFullName("");
      setFormMsg("Successfully assigned role!");
      setTimeout(() => setFormMsg(""), 3000);
    } catch (err: any) {
      setFormMsg(`Error: ${err?.message || String(err)}`);
    } finally {
      setSubmittingUser(false);
    }
  };

  const modules: ModuleName[] = [
    "Financial Records",
    "Financial Commitments",
    "Financial Forecast",
    "Financial Evidence Package"
  ];

  const rolesList: UserRole[] = [
    "HQ_OWNER",
    "HQ_STAFF",
    "TENANT_OWNER",
    "TENANT_STAFF"
  ];

  const getRoleDescription = (role: UserRole): string => {
    switch (role) {
      case "HQ_OWNER": return "Master absolute root administrator. Enforces multi-tenant compliance.";
      case "HQ_STAFF": return "HQ system operator context. Read & create profiles but restrict deletion.";
      case "TENANT_OWNER": return "Corporate account owner. Full billing, data disposal, and tenancy control.";
      case "TENANT_STAFF": return "Strict auditor or client view-only context. Read is validated.";
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm" id="permission_settings_console">
      {/* HEADER SECTION */}
      <div className="bg-slate-900 text-white p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-rose-400 font-mono text-xs uppercase tracking-wider mb-1">
            <FolderLock className="w-4 h-4 text-rose-500" />
            <span>HQ Secure Policy Administration Console</span>
          </div>
          <h3 className="font-display font-semibold text-2xl tracking-tight leading-tight">
            Permission Engine Foundation
          </h3>
          <p className="text-xs text-slate-350 font-sans max-w-xl">
            Enforce custom Access Control lists, define roles, configure matrices, and audit user permissions context dynamically.
          </p>
        </div>

        {/* Edit mode indicator */}
        <div className={`px-3.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center shrink-0 ${
          editRights 
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
            : "bg-amber-500/10 border-amber-500/30 text-amber-400"
        }`}>
          {editRights ? (
            <>
              <Unlock className="w-3.5 h-3.5 mr-1.5 text-emerald-400 animate-pulse" />
              ADMIN CONTROL ENABLED
            </>
          ) : (
            <>
              <Lock className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              READ-ONLY PLATFORM
            </>
          )}
        </div>
      </div>

      {/* HORIZONTAL TAB MENU */}
      <div className="flex border-b border-slate-100 bg-slate-50/50 p-2 gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("matrix")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold font-sans transition shrink-0 cursor-pointer flex items-center ${
            activeTab === "matrix" ? "bg-white text-slate-900 border border-slate-200/80 shadow-xs" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          id="btn_tab_matrix"
        >
          <Settings className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
          Permission Matrix Configurator
        </button>
        <button
          onClick={() => setActiveTab("assignments")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold font-sans transition shrink-0 cursor-pointer flex items-center ${
            activeTab === "assignments" ? "bg-white text-slate-900 border border-slate-200/80 shadow-xs" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          id="btn_tab_assignments"
        >
          <Users className="w-3.5 h-3.5 mr-1.5 text-sky-500" />
          User Role Assignments ({userRoles.length})
        </button>
        <button
          onClick={() => setActiveTab("visualizer")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold font-sans transition shrink-0 cursor-pointer flex items-center ${
            activeTab === "visualizer" ? "bg-white text-slate-900 border border-slate-200/80 shadow-xs" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          id="btn_tab_visualizer"
        >
          <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-rose-500 animate-pulse" />
          Access Control Visualizer
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center" id="permission_loader">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-mono">Syncing policy matrices...</p>
        </div>
      ) : (
        <div className="p-6 md:p-8">
          
          {/* TAB 1: PERMISSION MATRIX */}
          {activeTab === "matrix" && (
            <div className="space-y-6" id="matrix_tab_pane">
              <div>
                <h4 className="font-display font-semibold text-lg text-slate-900 leading-snug">
                  Enterprise Module Access Matrix
                </h4>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Configure real-time Read (R), Write (W), Create (C), and Delete (D) rights for each module. Override cells to fine-tune operations.
                </p>
              </div>

              {/* Policy Quick Information */}
              <div className="bg-sky-50 border border-sky-100/80 rounded-xl p-4 flex items-start space-x-3 text-xs leading-relaxed text-sky-800">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-sky-650" />
                <div className="font-sans">
                  <strong>Granular Security Overrides:</strong> HQ Administrators can customize cells globally. Toggling a permission instantly switches enforcement parameters inside RLS logic checkpoints across client screens.
                </div>
              </div>

              {/* ROUGH MATRIX GRID VIEW */}
              <div className="overflow-x-auto border border-slate-200/80 rounded-xl bg-white shadow-xs">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-mono text-[9px] uppercase font-bold border-b border-slate-200">
                      <th className="p-4 w-1/4">System Actor Role</th>
                      {modules.map(modName => (
                        <th key={modName} className="p-4 text-center">{modName}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rolesList.map(role => {
                      const permissions = permissionMatrix[role];
                      const isCurrentRole = user?.role === role;

                      return (
                        <tr 
                          key={role} 
                          className={`border-b border-slate-100 hover:bg-slate-50/60 transition ${
                            isCurrentRole ? "bg-slate-50/80 font-bold" : ""
                          }`}
                        >
                          {/* Role Descriptor Block */}
                          <td className="p-4 text-xs font-sans">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-slate-900">{role}</span>
                              {isCurrentRole && (
                                <span className="bg-indigo-600 text-white text-[8px] font-mono font-bold px-1.5 py-0.2 rounded-full uppercase">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <span className="block text-[10px] text-slate-500 font-sans font-normal mt-0.5 max-w-[200px]">
                              {getRoleDescription(role)}
                            </span>
                          </td>

                          {/* Matrix Module Cell Checkboxes */}
                          {modules.map(modName => {
                            const modPerms = permissions?.[modName] || { read: false, create: false, update: false, delete: false };

                            return (
                              <td key={`${role}-${modName}`} className="p-4 text-center">
                                <div className="flex items-center justify-center space-x-1">
                                  {/* Read Permission Badge */}
                                  <button
                                    type="button"
                                    onClick={() => editRights && updateMatrixCell(role, modName, "read", !modPerms.read)}
                                    disabled={!editRights}
                                    className={`w-7 h-7 flex items-center justify-center text-[10px] font-mono font-bold rounded-lg cursor-pointer transition ${
                                      modPerms.read
                                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                        : "bg-slate-50 text-slate-350 border border-slate-200/50 opacity-40 hover:opacity-100"
                                    }`}
                                    title="Read Rights"
                                  >
                                    R
                                  </button>

                                  {/* Create Permission Badge */}
                                  <button
                                    type="button"
                                    onClick={() => editRights && updateMatrixCell(role, modName, "create", !modPerms.create)}
                                    disabled={!editRights}
                                    className={`w-7 h-7 flex items-center justify-center text-[10px] font-mono font-bold rounded-lg cursor-pointer transition ${
                                      modPerms.create
                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        : "bg-slate-50 text-slate-350 border border-slate-200/50 opacity-40 hover:opacity-100"
                                    }`}
                                    title="Create Rights"
                                  >
                                    C
                                  </button>

                                  {/* Update Permission Badge */}
                                  <button
                                    type="button"
                                    onClick={() => editRights && updateMatrixCell(role, modName, "update", !modPerms.update)}
                                    disabled={!editRights}
                                    className={`w-7 h-7 flex items-center justify-center text-[10px] font-mono font-bold rounded-lg cursor-pointer transition ${
                                      modPerms.update
                                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                                        : "bg-slate-50 text-slate-350 border border-slate-200/50 opacity-40 hover:opacity-100"
                                    }`}
                                    title="Update Rights"
                                  >
                                    U
                                  </button>

                                  {/* Delete Permission Badge */}
                                  <button
                                    type="button"
                                    onClick={() => editRights && updateMatrixCell(role, modName, "delete", !modPerms.delete)}
                                    disabled={!editRights}
                                    className={`w-7 h-7 flex items-center justify-center text-[10px] font-mono font-bold rounded-lg cursor-pointer transition ${
                                      modPerms.delete
                                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                                        : "bg-slate-50 text-slate-350 border border-slate-200/50 opacity-40 hover:opacity-100"
                                    }`}
                                    title="Delete Rights"
                                  >
                                    D
                                  </button>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: USER ASSIGNMENTS */}
          {activeTab === "assignments" && (
            <div className="space-y-6" id="assignments_tab_pane">
              <div className="flex flex-col lg:flex-row gap-6">
                
                {/* Assignments List Deck */}
                <div className="flex-1 space-y-4">
                  <div>
                    <h4 className="font-display font-semibold text-lg text-slate-900 leading-snug">
                      Active Account Role Assignments
                    </h4>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">
                      Assign users to strict structural roles within the active tenant directory boundary. Changes cascade to permission engines.
                    </p>
                  </div>

                  <div className="space-y-2" id="role_assignments_deck">
                    {userRoles.map(asm => {
                      const isCurrentUser = asm.email === user?.email;
                      return (
                        <div 
                          key={asm.id} 
                          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/40 hover:bg-slate-50 ${
                            isCurrentUser ? "border-indigo-200/80 bg-indigo-50/10" : "border-slate-200/60"
                          } ${asm.isSuspended ? "opacity-60" : ""}`}
                        >
                          <div className="flex items-center space-x-3.5">
                            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 text-xs font-mono font-bold">
                              {asm.fullName.substring(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold text-slate-950 font-sans">{asm.fullName}</span>
                                {isCurrentUser && (
                                  <span className="bg-slate-900 text-white text-[8px] font-mono px-1.5 py-0.2 rounded-full uppercase">YOU</span>
                                )}
                                {asm.isSuspended && (
                                  <span className="bg-rose-100 text-rose-700 border border-rose-200 text-[8px] font-mono px-1.5 py-0.2 rounded-full uppercase">SUSPENDED</span>
                                )}
                              </div>
                              <span className="block text-[10px] text-slate-550 font-mono mt-0.5">{asm.email}</span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            {/* Role badge selection or status visualization */}
                            {editRights && !isCurrentUser ? (
                              <select
                                value={asm.role}
                                onChange={(e) => assignUserRole(asm.email, asm.fullName, e.target.value as UserRole)}
                                className="text-xs font-mono font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 px-y-1 focus:ring-0 outline-none cursor-pointer"
                              >
                                {rolesList.map(r => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-200 border border-slate-300 rounded text-[9px] font-mono font-bold text-slate-700">
                                {asm.role}
                              </span>
                            )}

                            {/* Suspend / Reactivate Option */}
                            {editRights && !isCurrentUser && asm.role !== "TENANT_OWNER" && (
                              <button
                                onClick={() => setUserAssignmentSuspended(asm.id, !asm.isSuspended)}
                                className={`p-1.5 rounded-lg font-mono text-xs cursor-pointer transition ${
                                  asm.isSuspended
                                    ? "text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50"
                                    : "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                }`}
                                title={asm.isSuspended ? "Reactivate Access" : "Suspend Access"}
                              >
                                {asm.isSuspended ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                              </button>
                            )}

                            {/* Revoke Option */}
                            {editRights && !isCurrentUser && (
                              <button
                                onClick={() => removeUserAssignment(asm.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg font-mono text-xs cursor-pointer transition hover:bg-rose-50"
                                title="Revoke Organization Role"
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Assignment Form Card */}
                {editRights ? (
                  <div className="w-full lg:w-80 bg-slate-50 border border-slate-200 rounded-2xl p-5 shrink-0 self-start">
                    <h5 className="font-display font-semibold text-sm text-slate-950 flex items-center mb-3">
                      <UserPlus className="w-4 h-4 mr-2 text-indigo-600" />
                      Add New Assignment
                    </h5>
                    
                    <form onSubmit={handleAddAssignment} className="space-y-4">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-500 font-mono uppercase">Full Name</label>
                        <input
                          type="text"
                          value={newFullName}
                          onChange={(e) => setNewFullName(e.target.value)}
                          placeholder="e.g. Johnathan Lim"
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 focus:border-slate-900 rounded-lg outline-none transition"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-500 font-mono uppercase">Email Address</label>
                        <input
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="j.lim@company.com"
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 focus:border-slate-900 rounded-lg outline-none transition"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-500 font-mono uppercase">System Actor Role</label>
                        <select
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none cursor-pointer"
                        >
                          {rolesList.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>

                      {formMsg && (
                        <div className="p-2.5 bg-indigo-900 text-indigo-100 border border-indigo-950 rounded bg-opacity-95 text-[10px] font-mono flex items-center">
                          <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                          <span>{formMsg}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={submittingUser}
                        className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition shadow-xs disabled:opacity-55 flex items-center justify-center"
                      >
                        {submittingUser ? "Assigning Role..." : "Assign Role Profile"}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="w-full lg:w-80 bg-amber-50/50 border border-amber-200/60 rounded-2xl p-5 self-start shrink-0 text-xs text-amber-805">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                      <div className="space-y-1">
                        <p className="font-bold">Administrative Lock</p>
                        <p className="text-[11px] leading-relaxed text-slate-600">
                          Role assignment and user mapping parameters are restricted strictly to authorized Tenant Administrators, Owners, and system Operators.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* TAB 3: VISUALIZER */}
          {activeTab === "visualizer" && (
            <div className="space-y-6 animate-fade-in" id="visualizer_tab_pane">
              <div>
                <h4 className="font-display font-semibold text-lg text-slate-900 leading-snug">
                  Granular Access Control Visualizer
                </h4>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Semak token aktif, kelayakan keselamatan dan status kebenaran anda.
                </p>
              </div>

              {/* Status bento container */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Active user status card */}
                <div className="p-5 border border-slate-205 rounded-2xl bg-slate-50/40 shadow-xs space-y-4">
                  <span className="text-xs font-semibold font-mono text-slate-400 block tracking-wider uppercase">Active Security Context</span>
                  
                  <div className="space-y-3 font-sans">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Authenticated Identity:</span>
                      <strong className="text-slate-900 font-mono">{user?.email}</strong>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Assigned Platform Role:</span>
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 font-mono font-bold text-[10px] rounded border border-indigo-200">
                        {user?.role}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">MAPPED SYSTEM CLEARANCE:</span>
                      <strong className="text-emerald-600 uppercase font-bold flex items-center">
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Verified RLS Token
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Workspace Capabilities visual container */}
                <div className="p-5 border border-slate-205 rounded-2xl bg-slate-50/40 shadow-xs space-y-4">
                  <span className="text-xs font-semibold font-mono text-slate-400 block tracking-wider uppercase">Workspace Operations Authorization</span>
                  
                  <div className="space-y-3 font-sans">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Workspace Construction (Create):</span>
                      {canManageWorkspaces() ? (
                        <span className="text-emerald-600 font-bold flex items-center"><Check className="w-3.5 h-3.5 mr-1" /> ALLOWED</span>
                      ) : (
                        <span className="text-rose-650 font-bold flex items-center"><X className="w-3.5 h-3.5 mr-1" /> RESTRICTED</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Workspace Disposal (Delete):</span>
                      {["HQ_OWNER", "TENANT_OWNER"].includes(user?.role || "") ? (
                        <span className="text-emerald-600 font-bold flex items-center"><Check className="w-3.5 h-3.5 mr-1" /> ALLOWED</span>
                      ) : (
                        <span className="text-rose-650 font-bold flex items-center"><X className="w-3.5 h-3.5 mr-1" /> RESTRICTED</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-505">Tenant Administration Hierarchy:</span>
                      {canManageTenants() ? (
                        <span className="text-amber-600 font-bold flex items-center"><Key className="w-3.5 h-3.5 mr-1" /> GLOBAL BYPASS</span>
                      ) : (
                        <span className="text-slate-500 font-bold">LOCALIZED ZONE</span>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Matrix flow visualization log terminal */}
              <div className="bg-slate-900 text-slate-350 p-5 rounded-xl font-mono text-xs space-y-2 border border-slate-850">
                <p className="text-emerald-400 font-bold flex items-center">
                  <Key className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                  MYKERANI RESTRICTION ENFORCEMENT ENGINE DIAGNOSTICS:
                </p>
                <div className="space-y-1 font-mono text-[10px] leading-relaxed text-slate-400">
                  <p>{`>> [SEC_INIT] Loaded active profile user token: "${user?.email}"`}</p>
                  <p>{`>> [SEC_INIT] Mapped authentication role parameter: "${user?.role}"`}</p>
                  <p>{`>> [SEC_MATRIX] Evaluating active structural modules clearances...`}</p>
                  {modules.map(modName => {
                    const r = permissionMatrix[user?.role || "TENANT_STAFF"]?.[modName]?.read;
                    const c = permissionMatrix[user?.role || "TENANT_STAFF"]?.[modName]?.create;
                    const u = permissionMatrix[user?.role || "TENANT_STAFF"]?.[modName]?.update;
                    const d = permissionMatrix[user?.role || "TENANT_STAFF"]?.[modName]?.delete;
                    return (
                      <p key={modName} className="pl-4">
                        {`-> Module: "${modName}" => [R:${r ? "OK" : "NO"} | C:${c ? "OK" : "NO"} | U:${u ? "OK" : "NO"} | D:${d ? "OK" : "NO"}]`}
                      </p>
                    );
                  })}
                  <p>{`>> [SEC_RLS] Verification checkpoints initialized. Row-Level Security isolation parameters synchronized.`}</p>
                </div>
              </div>

            </div>
          )}

        </div>
      )}
    </div>
  );
};

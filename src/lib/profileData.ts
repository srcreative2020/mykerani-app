import { supabase, isSupabaseConfigured } from "./supabase";
import { isDemoWorkspace } from "./seeder";

export interface PersonalProfile {
  fullName: string;
  dateOfBirth: string;
  maritalStatus: string;
  occupation: string;
  monthlyIncomeMyr: string;
  dependentsCount: string;
  notes: string;
}

export interface BusinessProfile {
  industry: string;
  branchName: string;
  businessType: string;
  registrationNo: string;
  notes: string;
}

export interface Business {
  id: string;
  businessName: string;
  industry: string;
  businessType: string;
  registrationNo: string;
  notes: string;
  isActive: boolean;
}

export interface BusinessBranch {
  id: string;
  businessId: string;
  branchName: string;
  location: string;
  isActive: boolean;
}

export interface Vehicle {
  id: string;
  name: string;
  plateNumber: string;
  vehicleType: string;
  ownership: "PERSONAL" | "BUSINESS";
  isActive: boolean;
}

export interface Dependent {
  id: string;
  name: string;
  relationship: string;
  dateOfBirth: string;
}

export const EMPTY_PERSONAL_PROFILE: PersonalProfile = {
  fullName: "",
  dateOfBirth: "",
  maritalStatus: "",
  occupation: "",
  monthlyIncomeMyr: "",
  dependentsCount: "",
  notes: "",
};

export const EMPTY_BUSINESS_PROFILE: BusinessProfile = {
  industry: "",
  branchName: "",
  businessType: "",
  registrationNo: "",
  notes: "",
};

const canPersist = (workspaceId: string | undefined, isMockUser: boolean): workspaceId is string =>
  Boolean(workspaceId) && isSupabaseConfigured() && !isMockUser && !!supabase && !isDemoWorkspace(workspaceId as string);

export const loadPersonalProfile = async (
  workspaceId: string | undefined,
  isMockUser: boolean
): Promise<PersonalProfile> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return EMPTY_PERSONAL_PROFILE;
  const { data, error } = await supabase
    .from("personal_profiles")
    .select("full_name,date_of_birth,marital_status,occupation,monthly_income_myr,dependents_count,notes")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) return EMPTY_PERSONAL_PROFILE;
  return {
    fullName: data.full_name || "",
    dateOfBirth: data.date_of_birth || "",
    maritalStatus: data.marital_status || "",
    occupation: data.occupation || "",
    monthlyIncomeMyr: data.monthly_income_myr != null ? String(data.monthly_income_myr) : "",
    dependentsCount: data.dependents_count != null ? String(data.dependents_count) : "",
    notes: data.notes || "",
  };
};

export const savePersonalProfile = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  profile: PersonalProfile
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("personal_profiles").upsert({
    workspace_id: workspaceId,
    full_name: profile.fullName || null,
    date_of_birth: profile.dateOfBirth || null,
    marital_status: profile.maritalStatus || null,
    occupation: profile.occupation || null,
    monthly_income_myr: profile.monthlyIncomeMyr ? Number(profile.monthlyIncomeMyr) : null,
    dependents_count: profile.dependentsCount ? Number(profile.dependentsCount) : null,
    notes: profile.notes || null,
  });
};

export const loadBusinessProfile = async (
  workspaceId: string | undefined,
  isMockUser: boolean
): Promise<BusinessProfile> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return EMPTY_BUSINESS_PROFILE;
  const { data, error } = await supabase
    .from("business_profiles")
    .select("industry,branch_name,business_type,registration_no,notes")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) return EMPTY_BUSINESS_PROFILE;
  return {
    industry: data.industry || "",
    branchName: data.branch_name || "",
    businessType: data.business_type || "",
    registrationNo: data.registration_no || "",
    notes: data.notes || "",
  };
};

export const saveBusinessProfile = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  profile: BusinessProfile
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("business_profiles").upsert({
    workspace_id: workspaceId,
    industry: profile.industry || null,
    branch_name: profile.branchName || null,
    business_type: profile.businessType || null,
    registration_no: profile.registrationNo || null,
    notes: profile.notes || null,
  });
};

export const loadBusinesses = async (
  workspaceId: string | undefined,
  isMockUser: boolean
): Promise<Business[]> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return [];
  const { data, error } = await supabase
    .from("businesses")
    .select("id,business_name,industry,business_type,registration_no,notes,is_active")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    businessName: row.business_name,
    industry: row.industry || "",
    businessType: row.business_type || "",
    registrationNo: row.registration_no || "",
    notes: row.notes || "",
    isActive: row.is_active,
  }));
};

export const addBusiness = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  business: Omit<Business, "id" | "isActive">
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("businesses").insert({
    workspace_id: workspaceId,
    business_name: business.businessName,
    industry: business.industry || null,
    business_type: business.businessType || null,
    registration_no: business.registrationNo || null,
    notes: business.notes || null,
  });
};

export const updateBusiness = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  businessId: string,
  business: Omit<Business, "id" | "isActive">
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase
    .from("businesses")
    .update({
      business_name: business.businessName,
      industry: business.industry || null,
      business_type: business.businessType || null,
      registration_no: business.registrationNo || null,
      notes: business.notes || null,
    })
    .eq("id", businessId)
    .eq("workspace_id", workspaceId);
};

export const deleteBusiness = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  businessId: string
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("businesses").delete().eq("id", businessId).eq("workspace_id", workspaceId);
};

export const loadBusinessBranches = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  businessId: string
): Promise<BusinessBranch[]> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return [];
  const { data, error } = await supabase
    .from("business_branches")
    .select("id,business_id,branch_name,location,is_active")
    .eq("workspace_id", workspaceId)
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    businessId: row.business_id,
    branchName: row.branch_name,
    location: row.location || "",
    isActive: row.is_active,
  }));
};

export const addBusinessBranch = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  branch: Omit<BusinessBranch, "id" | "isActive">
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("business_branches").insert({
    workspace_id: workspaceId,
    business_id: branch.businessId,
    branch_name: branch.branchName,
    location: branch.location || null,
  });
};

export const deleteBusinessBranch = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  branchId: string
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("business_branches").delete().eq("id", branchId).eq("workspace_id", workspaceId);
};

export const loadVehicles = async (
  workspaceId: string | undefined,
  isMockUser: boolean
): Promise<Vehicle[]> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return [];
  const { data, error } = await supabase
    .from("vehicles")
    .select("id,name,plate_number,vehicle_type,ownership,is_active")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    name: row.name,
    plateNumber: row.plate_number || "",
    vehicleType: row.vehicle_type || "",
    ownership: row.ownership,
    isActive: row.is_active,
  }));
};

export const addVehicle = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  vehicle: Omit<Vehicle, "id" | "isActive">
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("vehicles").insert({
    workspace_id: workspaceId,
    name: vehicle.name,
    plate_number: vehicle.plateNumber || null,
    vehicle_type: vehicle.vehicleType || null,
    ownership: vehicle.ownership,
  });
};

export const updateVehicle = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  vehicleId: string,
  vehicle: Omit<Vehicle, "id" | "isActive">
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase
    .from("vehicles")
    .update({
      name: vehicle.name,
      plate_number: vehicle.plateNumber || null,
      vehicle_type: vehicle.vehicleType || null,
      ownership: vehicle.ownership,
    })
    .eq("id", vehicleId)
    .eq("workspace_id", workspaceId);
};

export const deleteVehicle = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  vehicleId: string
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("vehicles").delete().eq("id", vehicleId).eq("workspace_id", workspaceId);
};

export const loadDependents = async (
  workspaceId: string | undefined,
  isMockUser: boolean
): Promise<Dependent[]> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return [];
  const { data, error } = await supabase
    .from("dependents")
    .select("id,name,relationship,date_of_birth")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    name: row.name,
    relationship: row.relationship || "",
    dateOfBirth: row.date_of_birth || "",
  }));
};

export const addDependent = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  dependent: Omit<Dependent, "id">
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("dependents").insert({
    workspace_id: workspaceId,
    name: dependent.name,
    relationship: dependent.relationship || null,
    date_of_birth: dependent.dateOfBirth || null,
  });
};

export const updateDependent = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  dependentId: string,
  dependent: Omit<Dependent, "id">
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase
    .from("dependents")
    .update({
      name: dependent.name,
      relationship: dependent.relationship || null,
      date_of_birth: dependent.dateOfBirth || null,
    })
    .eq("id", dependentId)
    .eq("workspace_id", workspaceId);
};

export const deleteDependent = async (
  workspaceId: string | undefined,
  isMockUser: boolean,
  dependentId: string
): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("dependents").delete().eq("id", dependentId).eq("workspace_id", workspaceId);
};

// ═════════════════════════════════════════════════════════════════════════════
// Financial Profile Enhancement — New Repository Types & CRUD Functions
// Blueprint: docs/superpowers/specs/2026-06-26-financial-profile-enhancement-design.md
// All follow the exact same pattern as the existing businesses/vehicles CRUD.
// ═════════════════════════════════════════════════════════════════════════════

// ─── Customers ─────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  isActive: boolean;
}

export const EMPTY_CUSTOMER: Customer = {
  id: "", name: "", email: "", phone: "", address: "", notes: "", isActive: true,
};

function mapCustomerRow(row: any): Customer {
  return {
    id: row.id,
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    address: row.address || "",
    notes: row.notes || "",
    isActive: row.is_active !== false,
  };
}

export const loadCustomers = async (workspaceId: string | undefined, isMockUser: boolean): Promise<Customer[]> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return [];
  const { data, error } = await supabase
    .from("profile_customers").select("*").eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(mapCustomerRow);
};

export const addCustomer = async (workspaceId: string | undefined, isMockUser: boolean, c: Omit<Customer, "id" | "isActive">): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_customers").insert({
    workspace_id: workspaceId, name: c.name,
    email: c.email || null, phone: c.phone || null, address: c.address || null, notes: c.notes || null,
  });
};

export const updateCustomer = async (workspaceId: string | undefined, isMockUser: boolean, id: string, c: Omit<Customer, "id" | "isActive">): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_customers").update({
    name: c.name, email: c.email || null, phone: c.phone || null, address: c.address || null, notes: c.notes || null,
  }).eq("id", id).eq("workspace_id", workspaceId);
};

export const deleteCustomer = async (workspaceId: string | undefined, isMockUser: boolean, id: string): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_customers").delete().eq("id", id).eq("workspace_id", workspaceId);
};

// ─── Suppliers ──────────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  isActive: boolean;
}

export const EMPTY_SUPPLIER: Supplier = {
  id: "", name: "", email: "", phone: "", address: "", notes: "", isActive: true,
};

function mapSupplierRow(row: any): Supplier {
  return {
    id: row.id,
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    address: row.address || "",
    notes: row.notes || "",
    isActive: row.is_active !== false,
  };
}

export const loadSuppliers = async (workspaceId: string | undefined, isMockUser: boolean): Promise<Supplier[]> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return [];
  const { data, error } = await supabase
    .from("profile_suppliers").select("*").eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(mapSupplierRow);
};

export const addSupplier = async (workspaceId: string | undefined, isMockUser: boolean, s: Omit<Supplier, "id" | "isActive">): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_suppliers").insert({
    workspace_id: workspaceId, name: s.name,
    email: s.email || null, phone: s.phone || null, address: s.address || null, notes: s.notes || null,
  });
};

export const updateSupplier = async (workspaceId: string | undefined, isMockUser: boolean, id: string, s: Omit<Supplier, "id" | "isActive">): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_suppliers").update({
    name: s.name, email: s.email || null, phone: s.phone || null, address: s.address || null, notes: s.notes || null,
  }).eq("id", id).eq("workspace_id", workspaceId);
};

export const deleteSupplier = async (workspaceId: string | undefined, isMockUser: boolean, id: string): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_suppliers").delete().eq("id", id).eq("workspace_id", workspaceId);
};

// ─── Properties ─────────────────────────────────────────────────────────────────

export interface PropertyRecord {
  id: string;
  propertyName: string;
  propertyType: string;
  address: string;
  purchaseValueMyr: number;
  notes: string;
  isActive: boolean;
}

export const EMPTY_PROPERTY: PropertyRecord = {
  id: "", propertyName: "", propertyType: "", address: "", purchaseValueMyr: 0, notes: "", isActive: true,
};

function mapPropertyRow(row: any): PropertyRecord {
  return {
    id: row.id,
    propertyName: row.property_name || "",
    propertyType: row.property_type || "",
    address: row.address || "",
    purchaseValueMyr: Number(row.purchase_value_myr) || 0,
    notes: row.notes || "",
    isActive: row.is_active !== false,
  };
}

export const loadProperties = async (workspaceId: string | undefined, isMockUser: boolean): Promise<PropertyRecord[]> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return [];
  const { data, error } = await supabase
    .from("profile_properties").select("*").eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(mapPropertyRow);
};

export const addProperty = async (workspaceId: string | undefined, isMockUser: boolean, p: Omit<PropertyRecord, "id" | "isActive">): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_properties").insert({
    workspace_id: workspaceId, property_name: p.propertyName,
    property_type: p.propertyType || null, address: p.address || null,
    purchase_value_myr: p.purchaseValueMyr || null, notes: p.notes || null,
  });
};

export const updateProperty = async (workspaceId: string | undefined, isMockUser: boolean, id: string, p: Omit<PropertyRecord, "id" | "isActive">): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_properties").update({
    property_name: p.propertyName, property_type: p.propertyType || null, address: p.address || null,
    purchase_value_myr: p.purchaseValueMyr || null, notes: p.notes || null,
  }).eq("id", id).eq("workspace_id", workspaceId);
};

export const deleteProperty = async (workspaceId: string | undefined, isMockUser: boolean, id: string): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_properties").delete().eq("id", id).eq("workspace_id", workspaceId);
};

// ─── Insurance ──────────────────────────────────────────────────────────────────

export interface InsurancePolicy {
  id: string;
  policyName: string;
  insuranceType: string;
  provider: string;
  policyNumber: string;
  premiumAmountMyr: number;
  premiumFrequency: string;
  coverageAmountMyr: number;
  startDate: string;
  endDate: string;
  notes: string;
  isActive: boolean;
}

export const EMPTY_INSURANCE: InsurancePolicy = {
  id: "", policyName: "", insuranceType: "", provider: "", policyNumber: "",
  premiumAmountMyr: 0, premiumFrequency: "", coverageAmountMyr: 0,
  startDate: "", endDate: "", notes: "", isActive: true,
};

function mapInsuranceRow(row: any): InsurancePolicy {
  return {
    id: row.id,
    policyName: row.policy_name || "",
    insuranceType: row.insurance_type || "",
    provider: row.provider || "",
    policyNumber: row.policy_number || "",
    premiumAmountMyr: Number(row.premium_amount_myr) || 0,
    premiumFrequency: row.premium_frequency || "",
    coverageAmountMyr: Number(row.coverage_amount_myr) || 0,
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    notes: row.notes || "",
    isActive: row.is_active !== false,
  };
}

export const loadInsurancePolicies = async (workspaceId: string | undefined, isMockUser: boolean): Promise<InsurancePolicy[]> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return [];
  const { data, error } = await supabase
    .from("profile_insurance").select("*").eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(mapInsuranceRow);
};

export const addInsurancePolicy = async (workspaceId: string | undefined, isMockUser: boolean, p: Omit<InsurancePolicy, "id" | "isActive">): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_insurance").insert({
    workspace_id: workspaceId, policy_name: p.policyName,
    insurance_type: p.insuranceType || null, provider: p.provider || null,
    policy_number: p.policyNumber || null, premium_amount_myr: p.premiumAmountMyr || null,
    premium_frequency: p.premiumFrequency || null, coverage_amount_myr: p.coverageAmountMyr || null,
    start_date: p.startDate || null, end_date: p.endDate || null, notes: p.notes || null,
  });
};

export const updateInsurancePolicy = async (workspaceId: string | undefined, isMockUser: boolean, id: string, p: Omit<InsurancePolicy, "id" | "isActive">): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_insurance").update({
    policy_name: p.policyName, insurance_type: p.insuranceType || null, provider: p.provider || null,
    policy_number: p.policyNumber || null, premium_amount_myr: p.premiumAmountMyr || null,
    premium_frequency: p.premiumFrequency || null, coverage_amount_myr: p.coverageAmountMyr || null,
    start_date: p.startDate || null, end_date: p.endDate || null, notes: p.notes || null,
  }).eq("id", id).eq("workspace_id", workspaceId);
};

export const deleteInsurancePolicy = async (workspaceId: string | undefined, isMockUser: boolean, id: string): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_insurance").delete().eq("id", id).eq("workspace_id", workspaceId);
};

// ─── Investments ────────────────────────────────────────────────────────────────

export interface Investment {
  id: string;
  investmentName: string;
  investmentType: string;
  institution: string;
  accountNumber: string;
  currentValueMyr: number;
  notes: string;
  isActive: boolean;
}

export const EMPTY_INVESTMENT: Investment = {
  id: "", investmentName: "", investmentType: "", institution: "", accountNumber: "",
  currentValueMyr: 0, notes: "", isActive: true,
};

function mapInvestmentRow(row: any): Investment {
  return {
    id: row.id,
    investmentName: row.investment_name || "",
    investmentType: row.investment_type || "",
    institution: row.institution || "",
    accountNumber: row.account_number || "",
    currentValueMyr: Number(row.current_value_myr) || 0,
    notes: row.notes || "",
    isActive: row.is_active !== false,
  };
}

export const loadInvestments = async (workspaceId: string | undefined, isMockUser: boolean): Promise<Investment[]> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return [];
  const { data, error } = await supabase
    .from("profile_investments").select("*").eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(mapInvestmentRow);
};

export const addInvestment = async (workspaceId: string | undefined, isMockUser: boolean, i: Omit<Investment, "id" | "isActive">): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_investments").insert({
    workspace_id: workspaceId, investment_name: i.investmentName,
    investment_type: i.investmentType || null, institution: i.institution || null,
    account_number: i.accountNumber || null, current_value_myr: i.currentValueMyr || null, notes: i.notes || null,
  });
};

export const updateInvestment = async (workspaceId: string | undefined, isMockUser: boolean, id: string, i: Omit<Investment, "id" | "isActive">): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_investments").update({
    investment_name: i.investmentName, investment_type: i.investmentType || null, institution: i.institution || null,
    account_number: i.accountNumber || null, current_value_myr: i.currentValueMyr || null, notes: i.notes || null,
  }).eq("id", id).eq("workspace_id", workspaceId);
};

export const deleteInvestment = async (workspaceId: string | undefined, isMockUser: boolean, id: string): Promise<void> => {
  if (!canPersist(workspaceId, isMockUser) || !supabase) return;
  await supabase.from("profile_investments").delete().eq("id", id).eq("workspace_id", workspaceId);
};

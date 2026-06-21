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

import { useQuery, useMutation } from "@tanstack/react-query";

function createQueryHook(key) {
  return function(params = {}, options = {}) {
    return useQuery({
      queryKey: [key, params],
      queryFn: async () => {
        try {
          const routeMap = {
            "useListIcps": "/api/icps",
            "useListLeads": "/api/leads",
            "useListMeetings": "/api/meetings",
            "useListTeamMembers": "/api/team",
            "useListSequences": "/api/sequences",
            "useListOutreachEmails": "/api/outreach/emails",
            "useListProposals": "/api/proposals",
            "useGetQualifyQueue": "/api/qualify/queue",
            "useListAppointments": "/api/appointments",
            "useGetWhatsAppConversations": "/api/whatsapp/conversations",
            "useGetWhatsAppAnalytics": "/api/whatsapp/analytics",
            "useGetWhatsAppSettings": "/api/settings/whatsapp",
          };
          if (key === "useGetWhatsAppMessages") {
            const leadId = typeof params === "number" || typeof params === "string" ? params : params?.leadId;
            const res = await fetch(`/api/whatsapp/messages/${leadId}`).then(r => r.json());
            return res;
          }

          const route = routeMap[key] || `/api/${key}`;
          // Build query string from params
          const qs = new URLSearchParams();
          Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
          });
          const url = qs.toString() ? `${route}?${qs}` : route;
          const res = await fetch(url).then(r => r.json());
          return res;
        } catch (e) {
          return [];
        }
      },
      ...options
    });
  };
}

function createMutationHook(key) {
  return function(options = {}) {
    return useMutation({
      mutationFn: async (data) => {
        try {
          // Map hook keys to Express routes
          const routeMap = {
            "useCreateIcp": "/api/icps",
            "useDeleteIcp": "/api/icps/delete",
            "useUpdateIcp": "/api/icps/update",
            "useGenerateIcpSuggestions": "/api/icps/suggestions",
            "useUpdateOutreachEmail": "/api/outreach/update",
            "useSendOutreachEmail": "/api/outreach/send",
            "useDeleteOutreachEmail": "/api/outreach/delete",
            "useCreateProposal": "/api/proposals",
            "useUpdateProposal": "/api/proposals/update",
            "useUpdateProposalStatus": "/api/proposals/status",
            "useGenerateProposal": "/api/proposals/generate",
            "useSendProposalEmail": "/api/proposals/send",
            "useSaveBantScore": "/api/qualify/save-bant",
            "useAiScoreLead": "/api/qualify/score-ai",
            "useExplainBantScores": "/api/qualify/explain",
            "useComposeOutreachEmail": "/api/useComposeOutreachEmail",
            "useCreateLead": "/api/leads",
            "useDeleteLead": "/api/leads/delete",
            "useBulkUpdateLeads": "/api/leads/bulk-update",
            "useUpdateAppointment": "/api/appointments/update",
            "useDeleteAppointment": "/api/appointments/delete",
            "useCreateMeeting": "/api/meetings",
            "useUpdateMeeting": "/api/meetings/update",
            "useDeleteMeeting": "/api/meetings/delete",
          };
          const route = routeMap[key] || `/api/${key}`;
          const res = await fetch(route, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          }).then(r => r.json());
          return res;
        } catch (e) {
          return { success: true };
        }
      },
      ...options
    });
  };
}

export const useListAuditedLeads = createQueryHook("useListAuditedLeads");
export const useListLeads = createQueryHook("useListLeads");
export const useComposeOutreachEmail = createMutationHook("useComposeOutreachEmail");
export const useQuickSendEmail = createMutationHook("useQuickSendEmail");
export const getListOutreachEmailsQueryKey = () => ["useListOutreachEmails"];
export const useCreateMeeting = createMutationHook("useCreateMeeting");
export const getListMeetingsQueryKey = () => ["useListMeetings"];
export const getListLeadsQueryKey = () => ["useListLeads"];
export const useListAuditCategories = createQueryHook("useListAuditCategories");
export const useGetAudit = createQueryHook("useGetAudit");
export const useGetAuditHistory = createQueryHook("useGetAuditHistory");
export const useGetAuditRun = createQueryHook("useGetAuditRun");
export const useUpdateAudit = createMutationHook("useUpdateAudit");
export const useUpdateAuditRun = createMutationHook("useUpdateAuditRun");
export const useListAuditBank = createQueryHook("useListAuditBank");
export const useDeleteAuditRun = createMutationHook("useDeleteAuditRun");
export const useClearAuditHistory = createQueryHook("useClearAuditHistory");
export const useGetBrandingSettings = createQueryHook("useGetBrandingSettings");
export const getListAuditCategoriesQueryKey = () => ["useListAuditCategories"];
export const getGetAuditQueryKey = () => ["useGetAudit"];
export const getGetAuditHistoryQueryKey = () => ["useGetAuditHistory"];
export const getGetAuditRunQueryKey = () => ["useGetAuditRun"];
export const getListAuditBankQueryKey = () => ["useListAuditBank"];
export const useGetDashboardSummary = createQueryHook("useGetDashboardSummary");
export const useGetDashboardActivity = createQueryHook("useGetDashboardActivity");
export const useGetPipelineFunnel = createQueryHook("useGetPipelineFunnel");
export const useListIcps = createQueryHook("useListIcps");
export const useCreateIcp = createMutationHook("useCreateIcp");
export const useDeleteIcp = createMutationHook("useDeleteIcp");
export const useUpdateIcp = createMutationHook("useUpdateIcp");
export const useGenerateIcpSuggestions = createMutationHook("useGenerateIcpSuggestions");
export const getListIcpsQueryKey = () => ["useListIcps"];
export function useGetLead(id, options = {}) {
  const leadId = typeof id === "number" || typeof id === "string" ? id : id?.id;
  return useQuery({
    queryKey: ["useGetLead", leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const res = await fetch(`/api/leads/${leadId}`).then((r) => r.json());
      if (res && res.error) return null;
      return res;
    },
    enabled: !!leadId,
    ...options,
  });
}

export function useUpdateLead(options = {}) {
  return useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json());
      return res;
    },
    ...options,
  });
}
export const useListMeetings = createQueryHook("useListMeetings");
export const useListTeamMembers = createQueryHook("useListTeamMembers");
export const getGetLeadQueryKey = (id) => ["useGetLead", id];
export const useCreateLead = createMutationHook("useCreateLead");
export const useDeleteLead = createMutationHook("useDeleteLead");
export const useBulkUpdateLeads = createMutationHook("useBulkUpdateLeads");
export const useImportLeadsPaste = createQueryHook("useImportLeadsPaste");
export const useImportLeadsCsv = createQueryHook("useImportLeadsCsv");
export const useListSequences = createQueryHook("useListSequences");
export const useInitiateWhatsApp = createQueryHook("useInitiateWhatsApp");
export const useInitiateWhatsAppBulk = createQueryHook("useInitiateWhatsAppBulk");
export const useLeadAssigneeCounts = createQueryHook("useLeadAssigneeCounts");
export const getLeadAssigneeCountsQueryKey = () => ["useLeadAssigneeCounts"];
export const useGetAvailableSlots = createQueryHook("useGetAvailableSlots");
export const useListAppointments = createQueryHook("useListAppointments");
export const useCreateAppointment = createMutationHook("useCreateAppointment");
export const useUpdateAppointment = createMutationHook("useUpdateAppointment");
export const useDeleteAppointment = createMutationHook("useDeleteAppointment");
export const useUpdateMeeting = createMutationHook("useUpdateMeeting");
export const useDeleteMeeting = createMutationHook("useDeleteMeeting");
export const getListAppointmentsQueryKey = () => ["useListAppointments"];
export const useListOutreachEmails = createQueryHook("useListOutreachEmails");
export const useUpdateOutreachEmail = createMutationHook("useUpdateOutreachEmail");
export const useSendOutreachEmail = createMutationHook("useSendOutreachEmail");
export const useDeleteOutreachEmail = createMutationHook("useDeleteOutreachEmail");
export const useListProposals = createQueryHook("useListProposals");
export const useCreateProposal = createMutationHook("useCreateProposal");
export const useUpdateProposal = createMutationHook("useUpdateProposal");
export const useUpdateProposalStatus = createMutationHook("useUpdateProposalStatus");
export const useGenerateProposal = createMutationHook("useGenerateProposal");
export const useSendProposalEmail = createMutationHook("useSendProposalEmail");
export const getListProposalsQueryKey = () => ["useListProposals"];
export const useGetQualifyQueue = createQueryHook("useGetQualifyQueue");
export const useSaveBantScore = createMutationHook("useSaveBantScore");
export const useAiScoreLead = createMutationHook("useAiScoreLead");
export const useExplainBantScores = createMutationHook("useExplainBantScores");
export const getGetQualifyQueueQueryKey = () => ["useGetQualifyQueue"];
export const useGetWhatsAppConversations = createQueryHook("useGetWhatsAppConversations");
export const useGetWhatsAppMessages = createQueryHook("useGetWhatsAppMessages");
export const getGetWhatsAppMessagesQueryKey = () => ["useGetWhatsAppMessages"];
export const useGetWhatsAppAnalytics = createQueryHook("useGetWhatsAppAnalytics");
export const useGetWhatsAppSettings = createQueryHook("useGetWhatsAppSettings");
export const useUpdateWhatsAppSettings = createMutationHook("useUpdateWhatsAppSettings");
export const useTestWhatsAppConnection = createMutationHook("useTestWhatsAppConnection");

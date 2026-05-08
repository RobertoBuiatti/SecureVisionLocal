import { apiClient, endpoints } from '@services/api';
import type { Automation, AutomationHistory } from '@shared/types';

interface CreateAutomationDTO {
  name: string;
  description?: string;
  enabled: boolean;
  trigger: Automation['trigger'];
  actions: Automation['actions'];
}

interface UpdateAutomationDTO extends Partial<CreateAutomationDTO> {}

interface AutomationHistoryResponse {
  history: AutomationHistory[];
  total: number;
}

class AutomationService {
  async getAll(): Promise<Automation[]> {
    const response = await apiClient.get<{ automations: Automation[] }>(endpoints.automation.list);
    return response.data.automations;
  }

  async getById(id: string): Promise<Automation> {
    const response = await apiClient.get<Automation>(endpoints.automation.get(id));
    return response.data;
  }

  async create(automation: CreateAutomationDTO): Promise<Automation> {
    const response = await apiClient.post<Automation>(endpoints.automation.create, automation);
    return response.data;
  }

  async update(id: string, updates: UpdateAutomationDTO): Promise<Automation> {
    const response = await apiClient.put<Automation>(endpoints.automation.update(id), updates);
    return response.data;
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(endpoints.automation.delete(id));
  }

  async trigger(id: string): Promise<void> {
    await apiClient.post(endpoints.automation.trigger(id));
  }

  async getHistory(params?: {
    automationId?: string;
    limit?: number;
    offset?: number;
  }): Promise<AutomationHistoryResponse> {
    const response = await apiClient.get<AutomationHistoryResponse>(endpoints.automation.history, {
      params,
    });
    return response.data;
  }

  async toggleEnabled(id: string, enabled: boolean): Promise<Automation> {
    return this.update(id, { enabled });
  }
}

export const automationService = new AutomationService();
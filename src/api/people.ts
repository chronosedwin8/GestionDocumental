import { api } from './client';
import type {
  AcademicPeriod,
  ApiDocument,
  Expediente,
  PageQuery,
  Paginated,
  Person,
  PersonEvent,
  PersonSummary,
  RequiredDocument,
} from '@/types/api';

export interface PeopleListQuery extends PageQuery {
  type?: string;
  q?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export function listPeople(query: PeopleListQuery = {}, signal?: AbortSignal): Promise<Paginated<PersonSummary>> {
  return api.get<Paginated<PersonSummary>>('/people', { ...query }, signal);
}

export type CreatePersonInput = Omit<Person, 'id' | 'full_name' | 'created_at' | 'updated_at' | 'completeness'>;

export function createPerson(input: Partial<CreatePersonInput>): Promise<Person> {
  return api.post<Person>('/people', input);
}

export function getPerson(id: string, signal?: AbortSignal): Promise<Person> {
  return api.get<Person>(`/people/${id}`, undefined, signal);
}

export function updatePerson(id: string, data: Partial<CreatePersonInput>): Promise<Person> {
  return api.patch<Person>(`/people/${id}`, data);
}

export function listPersonExpedientes(id: string, signal?: AbortSignal): Promise<Expediente[]> {
  return api.get<Expediente[]>(`/people/${id}/expedientes`, undefined, signal);
}

/**
 * El servidor responde `Paginated<Document>` (reutiliza el listado de
 * documentos con `person_id`), no el arreglo plano que sugiere el contrato.
 */
export function listPersonDocuments(
  id: string,
  signal?: AbortSignal,
): Promise<Paginated<ApiDocument>> {
  return api.get<Paginated<ApiDocument>>(`/people/${id}/documents`, undefined, signal);
}

export function listPersonEvents(id: string, signal?: AbortSignal): Promise<PersonEvent[]> {
  return api.get<PersonEvent[]>(`/people/${id}/events`, undefined, signal);
}

export interface CreatePersonEventInput {
  event_type: string;
  title: string;
  description?: string;
  event_date: string;
  document_id?: string;
}

export function createPersonEvent(id: string, input: CreatePersonEventInput): Promise<PersonEvent> {
  return api.post<PersonEvent>(`/people/${id}/events`, input);
}

export function getRequiredDocuments(
  type?: string,
  signal?: AbortSignal,
): Promise<RequiredDocument[]> {
  return api.get<RequiredDocument[]>('/people/required-documents', type ? { type } : undefined, signal);
}

export function setRequiredDocuments(
  personTypeCode: string,
  items: RequiredDocument[],
): Promise<RequiredDocument[]> {
  return api.put<RequiredDocument[]>('/people/required-documents', {
    person_type_code: personTypeCode,
    items,
  });
}

/* -------------------------------------------------------- periodos */

export function listAcademicPeriods(signal?: AbortSignal): Promise<AcademicPeriod[]> {
  return api.get<AcademicPeriod[]>('/academic-periods', undefined, signal);
}

export function createAcademicPeriod(input: Omit<AcademicPeriod, 'id'>): Promise<AcademicPeriod> {
  return api.post<AcademicPeriod>('/academic-periods', input);
}

export function updateAcademicPeriod(id: string, data: Partial<AcademicPeriod>): Promise<AcademicPeriod> {
  return api.patch<AcademicPeriod>(`/academic-periods/${id}`, data);
}

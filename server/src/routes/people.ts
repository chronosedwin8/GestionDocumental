import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireAnyModuleAccess, requireFeature, requireFullAccess } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { listDocuments } from '../services/documents.js';
import {
  addPersonEvent,
  createPerson,
  getPersonForUser,
  listPeople,
  listPersonEvents,
  listPersonExpedientes,
  listRequiredDocuments,
  setRequiredDocuments,
  updatePerson,
} from '../services/people.js';
import { param } from '../lib/params.js';

export const peopleRouter = Router();

peopleRouter.use(requireAuth);

// ── Documentos obligatorios (antes de /:id para no colisionar) ──

peopleRouter.get(
  '/required-documents',
  validateQuery(z.object({ type: z.string().optional() })),
  async (req: Request, res: Response) => {
    const { type } = req.query as { type?: string };
    res.json(await listRequiredDocuments(type));
  },
);

peopleRouter.put(
  '/required-documents',
  requireFullAccess,
  requireFeature('PEOPLE_MANAGE'),
  validateBody(
    z.object({
      person_type_code: z.string().min(2),
      items: z.array(z.object({ document_type: z.string().min(1), is_mandatory: z.boolean() })),
    }),
  ),
  async (req: Request, res: Response) => {
    const body = req.body as { person_type_code: string; items: { document_type: string; is_mandatory: boolean }[] };
    const result = await setRequiredDocuments(body.person_type_code, body.items);
    await audit(req, 'SET_REQUIRED_DOCUMENTS', 'person_type', body.person_type_code, { count: body.items.length });
    res.json(result);
  },
);

const listQuery = z.object({
  type: z.string().optional(),
  q: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

peopleRouter.get('/', validateQuery(listQuery), async (req: Request, res: Response) => {
  res.json(await listPeople(currentUser(req), req.query as z.infer<typeof listQuery>));
});

const personSchema = z.object({
  type_code: z.string().min(2),
  document_number: z.string().min(3),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  birth_date: z.string().nullable().optional(),
  hire_date: z.string().nullable().optional(),
  termination_date: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  grade: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

peopleRouter.post('/', requireAnyModuleAccess('write'), requireFeature('PEOPLE_MANAGE'), validateBody(personSchema), async (req: Request, res: Response) => {
  const person = await createPerson(currentUser(req), req.body as Record<string, unknown>);
  await audit(req, 'CREATE_PERSON', 'person', person.id as string, {
    type_code: person.type_code,
    document_number: person.document_number,
  });
  res.status(201).json(person);
});

peopleRouter.get('/:id', async (req: Request, res: Response) => {
  res.json(await getPersonForUser(currentUser(req), param(req, 'id')));
});

peopleRouter.patch(
  '/:id',
  requireAnyModuleAccess('write'),
  requireFeature('PEOPLE_MANAGE'),
  validateBody(personSchema.partial()),
  async (req: Request, res: Response) => {
    const person = await updatePerson(param(req, 'id'), req.body as Record<string, unknown>);
    await audit(req, 'UPDATE_PERSON', 'person', param(req, 'id'), req.body as Record<string, unknown>);
    res.json(person);
  },
);

peopleRouter.get('/:id/expedientes', async (req: Request, res: Response) => {
  res.json(await listPersonExpedientes(currentUser(req), param(req, 'id')));
});

peopleRouter.get('/:id/documents', async (req: Request, res: Response) => {
  res.json(await listDocuments(currentUser(req), { person_id: param(req, 'id'), pageSize: 100 }));
});

peopleRouter.get('/:id/events', requireAnyModuleAccess('read'), async (req: Request, res: Response) => {
  res.json(await listPersonEvents(param(req, 'id')));
});

peopleRouter.post(
  '/:id/events',
  requireAnyModuleAccess('write'),
  requireFeature('PERSON_EVENT_ADD'),
  validateBody(
    z.object({
      event_type: z.string().min(2),
      title: z.string().min(2),
      description: z.string().nullable().optional(),
      event_date: z.string().min(8),
      document_id: z.string().uuid().nullable().optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const body = req.body as {
      event_type: string;
      title: string;
      description?: string | null;
      event_date: string;
      document_id?: string | null;
    };
    const event = await addPersonEvent(currentUser(req), param(req, 'id'), body);
    await audit(req, 'ADD_PERSON_EVENT', 'person', param(req, 'id'), { event_type: body.event_type });
    res.status(201).json(event);
  },
);

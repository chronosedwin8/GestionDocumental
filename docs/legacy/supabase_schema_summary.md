# Esquema real en Supabase (extraído 2026-09-17T22:20:45.002Z)

## expediente_documents
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `expediente_id` uuid NOT NULL — Note: This is a Foreign Key to `expedientes.id`.<fk table='expedientes' column='id'/>
- `document_id` uuid NOT NULL — Note: This is a Foreign Key to `documents.id`.<fk table='documents' column='id'/>
- `orden` integer NOT NULL default=0
- `fecha_inclusion` timestamp with time zone NOT NULL default="now()"
- `incluido_por` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>

## expedientes
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `radicado` text NOT NULL
- `titulo` text NOT NULL
- `descripcion` text
- `module` text NOT NULL
- `estado` text NOT NULL default="ABIERTO"
- `fecha_apertura` date NOT NULL default="CURRENT_DATE"
- `fecha_cierre` date
- `responsable_id` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `serie` text
- `subserie` text
- `created_by` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `created_at` timestamp with time zone NOT NULL default="now()"
- `updated_at` timestamp with time zone NOT NULL default="now()"
- `correspondence_type` public.correspondence_type
- `sender` text
- `recipient` text
- `is_correspondence` boolean NOT NULL default=false

## document_categories
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `name` text NOT NULL
- `description` text
- `color` text NOT NULL default="#6366f1"
- `is_active` boolean NOT NULL default=true
- `sort_order` integer NOT NULL default=0
- `created_by` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `created_at` timestamp with time zone default="now()"
- `updated_at` timestamp with time zone default="now()"
- `module` text
- `parent_id` uuid — Note: This is a Foreign Key to `document_categories.id`.<fk table='document_categories' column='id'/>

## role_permissions
- `role` public.user_role NOT NULL — Note: This is a Primary Key.<pk/>
- `can_read` boolean default=false
- `can_write` boolean default=false
- `can_delete` boolean default=false
- `can_manage_users` boolean default=false

## profiles
- `id` uuid NOT NULL — Note: This is a Primary Key.<pk/>
- `email` text NOT NULL
- `full_name` text NOT NULL
- `role` public.user_role NOT NULL default="SIN_ASIGNAR"
- `department` text
- `avatar_url` text
- `is_active` boolean default=true
- `created_at` timestamp with time zone default="now()"
- `updated_at` timestamp with time zone default="now()"
- `allowed_modules` text[] — Lista de módulos adicionales a los del rol base. Permite excepciones individuales.
- `last_seen_at` timestamp with time zone — Última vez que el usuario accedió al sistema.

## document_notes
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `document_id` uuid — Note: This is a Foreign Key to `documents.id`.<fk table='documents' column='id'/>
- `author_id` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `text` text NOT NULL
- `created_at` timestamp with time zone default="now()"

## deletion_requests
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `document_id` uuid NOT NULL
- `document_title` text NOT NULL
- `document_summary` text
- `document_module` text NOT NULL
- `document_s3_key` text NOT NULL
- `requested_by` uuid NOT NULL
- `requested_by_name` text NOT NULL
- `requested_at` timestamp with time zone default="now()"
- `reason` text NOT NULL
- `status` text NOT NULL default="PENDING"
- `reviewed_by` uuid
- `reviewed_by_name` text
- `reviewed_at` timestamp with time zone
- `review_notes` text
- `created_at` timestamp with time zone default="now()"
- `updated_at` timestamp with time zone default="now()"

## document_permissions
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `document_id` uuid — Note: This is a Foreign Key to `documents.id`.<fk table='documents' column='id'/>
- `role` public.user_role NOT NULL
- `can_read` boolean default=true
- `can_write` boolean default=false
- `can_delete` boolean default=false
- `created_at` timestamp with time zone default="now()"

## custody_chain
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `document_id` uuid
- `document_title` text NOT NULL
- `document_module` text NOT NULL
- `s3_key` text
- `event_type` text NOT NULL
- `event_details` jsonb
- `actor_id` uuid
- `actor_email` text
- `actor_role` text
- `created_at` timestamp with time zone NOT NULL default="now()"

## role_module_access
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `role` text NOT NULL
- `module` text NOT NULL
- `can_read` boolean NOT NULL default=true
- `can_write` boolean NOT NULL default=false
- `created_at` timestamp with time zone NOT NULL default="now()"
- `updated_at` timestamp with time zone NOT NULL default="now()"

## documents
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `title` text NOT NULL
- `type` text NOT NULL
- `module` public.module_type NOT NULL
- `folio_index` text
- `s3_key` text NOT NULL
- `s3_bucket` text NOT NULL default="gestion-documental"
- `status` public.document_status default="ARCHIVO_GESTION"
- `author_id` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `summary` text
- `category` text
- `subcategory` text
- `retention_end_date` date
- `expiration_date` date
- `is_signed` boolean default=false
- `signed_by` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `signed_at` timestamp with time zone
- `file_size` bigint
- `file_type` text
- `created_at` timestamp with time zone default="now()"
- `updated_at` timestamp with time zone default="now()"
- `search_vector` tsvector
- `deleted_at` timestamp with time zone — Fecha en que el documento fue enviado a la papelera. NULL = activo.
- `deleted_by` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `delete_reason` text
- `permanent_delete_at` timestamp with time zone — Fecha en que se eliminará físicamente (deleted_at + 30 días).

## document_versions
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `document_id` uuid — Note: This is a Foreign Key to `documents.id`.<fk table='documents' column='id'/>
- `version_number` text NOT NULL
- `s3_key` text NOT NULL
- `changes` text
- `author_id` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `file_size` bigint
- `created_at` timestamp with time zone default="now()"

## document_tags
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `document_id` uuid — Note: This is a Foreign Key to `documents.id`.<fk table='documents' column='id'/>
- `tag` text NOT NULL
- `created_at` timestamp with time zone default="now()"

## retention_rules
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `module` public.module_type NOT NULL
- `document_type` text NOT NULL
- `retention_years` integer NOT NULL
- `disposition` text
- `description` text
- `created_by` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `created_at` timestamp with time zone default="now()"
- `updated_at` timestamp with time zone default="now()"

## trash_documents
- `id` uuid — Note: This is a Primary Key.<pk/>
- `title` text
- `type` text
- `module` public.module_type
- `folio_index` text
- `s3_key` text
- `s3_bucket` text
- `status` public.document_status
- `author_id` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `summary` text
- `category` text
- `subcategory` text
- `retention_end_date` date
- `expiration_date` date
- `is_signed` boolean
- `signed_by` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `signed_at` timestamp with time zone
- `file_size` bigint
- `file_type` text
- `created_at` timestamp with time zone
- `updated_at` timestamp with time zone
- `search_vector` tsvector
- `deleted_at` timestamp with time zone
- `deleted_by` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `delete_reason` text
- `permanent_delete_at` timestamp with time zone
- `deleted_by_name` text

## document_loans
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `document_id` uuid NOT NULL — Note: This is a Foreign Key to `documents.id`.<fk table='documents' column='id'/>
- `document_title` text NOT NULL
- `module` text NOT NULL
- `loaned_to` uuid NOT NULL — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `loaned_by` uuid NOT NULL — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `loan_date` timestamp with time zone NOT NULL default="now()"
- `expected_return_date` date NOT NULL
- `actual_return_date` timestamp with time zone
- `purpose` text NOT NULL
- `status` public.loan_status NOT NULL default="ACTIVE"
- `notes` text
- `created_at` timestamp with time zone NOT NULL default="now()"
- `updated_at` timestamp with time zone NOT NULL default="now()"

## document_metadata
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `document_id` uuid — Note: This is a Foreign Key to `documents.id`.<fk table='documents' column='id'/>
- `key` text NOT NULL
- `value` text
- `is_extracted` boolean default=false
- `confidence` numeric
- `created_at` timestamp with time zone default="now()"

## deletion_logs
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `document_id` uuid NOT NULL
- `document_title` text NOT NULL
- `document_summary` text
- `document_module` text NOT NULL
- `document_s3_key` text NOT NULL
- `deleted_by` uuid NOT NULL
- `deleted_by_name` text NOT NULL
- `deleted_at` timestamp with time zone default="now()"
- `reason` text NOT NULL
- `was_request` boolean default=false
- `original_requester` text
- `created_at` timestamp with time zone default="now()"

## notifications
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `user_id` uuid NOT NULL — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `type` text NOT NULL
- `title` text NOT NULL
- `message` text NOT NULL
- `data` jsonb
- `is_read` boolean NOT NULL default=false
- `created_at` timestamp with time zone NOT NULL default="now()"
- `document_id` uuid

## system_config
- `key` text NOT NULL — Note: This is a Primary Key.<pk/>
- `value` jsonb NOT NULL
- `description` text
- `updated_by` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `updated_at` timestamp with time zone default="now()"

## audit_logs
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `user_id` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `user_email` text
- `action` text NOT NULL
- `resource_type` text
- `resource_id` text
- `details` jsonb
- `ip_address` inet
- `user_agent` text
- `created_at` timestamp with time zone default="now()"

## document_relations
- `id` uuid NOT NULL default="gen_random_uuid()" — Note: This is a Primary Key.<pk/>
- `source_document_id` uuid NOT NULL — Note: This is a Foreign Key to `documents.id`.<fk table='documents' column='id'/>
- `target_document_id` uuid NOT NULL — Note: This is a Foreign Key to `documents.id`.<fk table='documents' column='id'/>
- `relation_type` text NOT NULL default="BIDIRECTIONAL"
- `created_by` uuid — Note: This is a Foreign Key to `profiles.id`.<fk table='profiles' column='id'/>
- `created_at` timestamp with time zone default="now()"

## RPC
- is_admin
- generate_radicado
- restore_document
- log_custody_event
- get_user_loaned_documents
- assign_folio
- log_action
- soft_delete_document
- get_user_role
- process_retention_dispositions
- can_access_module
- get_dashboard_stats
- create_retention_notifications
- mark_overdue_loans
- is_admin_or_rector
- generate_folio_index
- search_documents_fulltext
- search_documents_advanced

import { ObjectId } from 'mongodb';
import {
  getMongoDbOrThrow,
  getNextNumericId,
  stripMongoId,
  type FlexDoc,
} from '@/lib/db/mongo-utils';
import type {
  CreateSurgeryGroupInput,
  UpdateSurgeryGroupInput,
} from '@/lib/dental/schemas';

export type SurgeryGroupDoc = {
  id: number;
  client_id: number;
  tenant_id: ObjectId;
  user_id: number;
  tooth_fdis: number[];
  comment: string;
  doctor_user_id: number;
  doctor_name_snapshot: string;
  created_at: string;
  updated_at: string;
};

type Scope = {
  tenantId: ObjectId;
  userId: number;
  clientId: number;
};

type DoctorIdentity = {
  doctorUserId: number;
  doctorName: string;
};

export async function listSurgeryGroups(scope: Scope): Promise<SurgeryGroupDoc[]> {
  const db = await getMongoDbOrThrow();
  const docs = await db
    .collection('surgery_groups')
    .find({
      tenant_id: scope.tenantId,
      client_id: scope.clientId,
      user_id: scope.userId,
    })
    .sort({ created_at: -1 })
    .toArray();
  return docs.map((doc) => stripMongoId(doc) as SurgeryGroupDoc);
}

export async function createSurgeryGroup(
  scope: Scope,
  doctor: DoctorIdentity,
  input: CreateSurgeryGroupInput
): Promise<SurgeryGroupDoc> {
  const db = await getMongoDbOrThrow();
  const id = await getNextNumericId('surgery_groups');
  const now = new Date().toISOString();
  // Dedupe FDIs to keep storage canonical.
  const tooth_fdis = Array.from(new Set(input.tooth_fdis)).sort((a, b) => a - b);

  const doc: SurgeryGroupDoc & FlexDoc = {
    _id: id,
    id,
    tenant_id: scope.tenantId,
    client_id: scope.clientId,
    user_id: scope.userId,
    tooth_fdis,
    comment: input.comment,
    doctor_user_id: doctor.doctorUserId,
    doctor_name_snapshot: doctor.doctorName,
    created_at: now,
    updated_at: now,
  };

  await db.collection<FlexDoc>('surgery_groups').insertOne(doc);
  return stripMongoId(doc) as SurgeryGroupDoc;
}

export async function updateSurgeryGroup(
  scope: Scope,
  groupId: number,
  input: UpdateSurgeryGroupInput
): Promise<SurgeryGroupDoc | null> {
  const db = await getMongoDbOrThrow();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.tooth_fdis) {
    update.tooth_fdis = Array.from(new Set(input.tooth_fdis)).sort((a, b) => a - b);
  }
  if (input.comment !== undefined) {
    update.comment = input.comment;
  }

  const result = await db.collection('surgery_groups').findOneAndUpdate(
    {
      id: groupId,
      tenant_id: scope.tenantId,
      client_id: scope.clientId,
      user_id: scope.userId,
    },
    { $set: update },
    { returnDocument: 'after' }
  );

  if (!result) return null;
  return stripMongoId(result) as SurgeryGroupDoc;
}

export async function deleteSurgeryGroup(scope: Scope, groupId: number): Promise<boolean> {
  const db = await getMongoDbOrThrow();
  const result = await db.collection('surgery_groups').deleteOne({
    id: groupId,
    tenant_id: scope.tenantId,
    client_id: scope.clientId,
    user_id: scope.userId,
  });
  return result.deletedCount > 0;
}

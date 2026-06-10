import { ObjectId } from 'mongodb';
import {
  getMongoDbOrThrow,
  getNextNumericId,
  stripMongoId,
  type FlexDoc,
} from '@/lib/db/mongo-utils';
import type {
  CreateBridgeGroupInput,
  UpdateBridgeGroupInput,
} from '@/lib/dental/schemas';

export type BridgeGroupDoc = {
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

export async function listBridgeGroups(scope: Scope): Promise<BridgeGroupDoc[]> {
  const db = await getMongoDbOrThrow();
  const docs = await db
    .collection('bridge_groups')
    .find({
      tenant_id: scope.tenantId,
      client_id: scope.clientId,
      user_id: scope.userId,
    })
    .sort({ created_at: -1 })
    .toArray();
  return docs.map((doc) => stripMongoId(doc) as BridgeGroupDoc);
}

export async function createBridgeGroup(
  scope: Scope,
  doctor: DoctorIdentity,
  input: CreateBridgeGroupInput
): Promise<BridgeGroupDoc> {
  const db = await getMongoDbOrThrow();
  const id = await getNextNumericId('bridge_groups');
  const now = new Date().toISOString();
  // Dedupe FDIs and store sorted so range computation is canonical.
  const tooth_fdis = Array.from(new Set(input.tooth_fdis)).sort((a, b) => a - b);

  const doc: BridgeGroupDoc & FlexDoc = {
    _id: id,
    id,
    tenant_id: scope.tenantId,
    client_id: scope.clientId,
    user_id: scope.userId,
    tooth_fdis,
    comment: input.comment ?? '',
    doctor_user_id: doctor.doctorUserId,
    doctor_name_snapshot: doctor.doctorName,
    created_at: now,
    updated_at: now,
  };

  await db.collection<FlexDoc>('bridge_groups').insertOne(doc);
  return stripMongoId(doc) as BridgeGroupDoc;
}

export async function updateBridgeGroup(
  scope: Scope,
  groupId: number,
  input: UpdateBridgeGroupInput
): Promise<BridgeGroupDoc | null> {
  const db = await getMongoDbOrThrow();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.tooth_fdis) {
    update.tooth_fdis = Array.from(new Set(input.tooth_fdis)).sort((a, b) => a - b);
  }
  if (input.comment !== undefined) {
    update.comment = input.comment;
  }

  const result = await db.collection('bridge_groups').findOneAndUpdate(
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
  return stripMongoId(result) as BridgeGroupDoc;
}

export async function deleteBridgeGroup(scope: Scope, groupId: number): Promise<boolean> {
  const db = await getMongoDbOrThrow();
  const result = await db.collection('bridge_groups').deleteOne({
    id: groupId,
    tenant_id: scope.tenantId,
    client_id: scope.clientId,
    user_id: scope.userId,
  });
  return result.deletedCount > 0;
}

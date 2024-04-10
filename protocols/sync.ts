/**
 * @module sync-protocol
 */

import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as Y from 'yjs'

//type StateMap = Map<number, number>;

/**
 * Core Yjs defines two message types:
 * • YjsSyncStep1: Includes the State Set of the sending client. When received, the client should reply with YjsSyncStep2.
 * • YjsSyncStep2: Includes all missing structs and the complete delete set. When received, the client is assured that it
 *   received all information from the remote client.
 *
 * In a peer-to-peer network, you may want to introduce a SyncDone message type. Both parties should initiate the connection
 * with SyncStep1. When a client received SyncStep2, it should reply with SyncDone. When the local client received both
 * SyncStep2 and SyncDone, it is assured that it is synced to the remote client.
 *
 * In a client-server model, you want to handle this differently: The client should initiate the connection with SyncStep1.
 * When the server receives SyncStep1, it should reply with SyncStep2 immediately followed by SyncStep1. The client replies
 * with SyncStep2 when it receives SyncStep1. Optionally the server may send a SyncDone after it received SyncStep2, so the
 * client knows that the sync is finished.  There are two reasons for this more elaborated sync model: 1. This protocol can
 * easily be implemented on top of http and websockets. 2. The server should only reply to requests, and not initiate them.
 * Therefore it is necessary that the client initiates the sync.
 *
 * Construction of a message:
 * [messageType : varUint, message definition..]
 *
 * Note: A message does not include information about the room name. This must to be handled by the upper layer protocol!
 *
 * stringify[messageType] stringifies a message definition (messageType is already read from the bufffer)
 */

export enum SyncMessageType {
	Step1 = 0,
	Step2 = 1,
	Update = 2,
	Done = 3,
}

type StateVector = Uint8Array
type UpdateVector = Uint8Array

// Create a sync step 1 message based on the state of the current shared document.
export const writeSyncStep1 = (encoder: encoding.Encoder, doc: Y.Doc) => {
	encoding.writeVarUint(encoder, SyncMessageType.Step1)
	const sv = Y.encodeStateVector(doc)
	encoding.writeVarUint8Array(encoder, sv)
}

export const writeSyncStep2 = (
	encoder: encoding.Encoder,
	doc: Y.Doc,
	encodedStateVector: StateVector
) => {
	encoding.writeVarUint(encoder, SyncMessageType.Step2)
	encoding.writeVarUint8Array(
		encoder,
		Y.encodeStateAsUpdate(doc, encodedStateVector)
	)
}

// Read SyncStep1 message and reply with SyncStep2.
export const readSyncStep1 = (
	decoder: decoding.Decoder,
	encoder: encoding.Encoder,
	doc: Y.Doc
) => {
	writeSyncStep2(encoder, doc, decoding.readVarUint8Array(decoder))
}

// Read and apply Structs and then DeleteStore to a y instance.
export const readSyncStep2 = (
	decoder: decoding.Decoder,
	doc: Y.Doc,
	transactionOrigin: any
) => {
	try {
		Y.applyUpdate(
			doc,
			decoding.readVarUint8Array(decoder),
			transactionOrigin
		)
	} catch (error) {
		// This catches errors that are thrown by event handlers
		console.error('Caught error while handling a Yjs update', error)
	}
}
export const readUpdate = readSyncStep2

export const writeUpdate = (
	encoder: encoding.Encoder,
	update: UpdateVector
) => {
	encoding.writeVarUint(encoder, SyncMessageType.Update)
	encoding.writeVarUint8Array(encoder, update)
}

export const readSyncMessage = (
	decoder: decoding.Decoder,
	encoder: encoding.Encoder,
	doc: Y.Doc,
	transactionOrigin: any
) => {
	const messageType = decoding.readVarUint(decoder)
	switch (messageType) {
		case SyncMessageType.Step1:
			readSyncStep1(decoder, encoder, doc)
			break
		case SyncMessageType.Step2:
			readSyncStep2(decoder, doc, transactionOrigin)
			break
		case SyncMessageType.Update:
			readUpdate(decoder, doc, transactionOrigin)
			break
		default:
			throw new Error('Unknown message type')
	}
	return messageType
}

import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";

import { awarenessProtocol, syncProtocol } from "@/trust/protocols";

import { MessageType } from "./MessageType";
import { Room } from "./Room";
import { TrysteroConn } from "./TrysteroConn";
//import { checkIsSynced } from './checkIsSynced'
import { broadcastBcPeerId } from "./messagesSend";

// read message from buffer and emit message
export const readMessage = (
  room: Room,
  buf: Uint8Array,
  syncedCallback: () => void,
): encoding.Encoder | null => {
  const decoder = decoding.createDecoder(buf);
  const encoder = encoding.createEncoder();
  const messageType = decoding.readVarUint(decoder);
  if (room === undefined) {
    return null;
  }
  const awareness = room.awareness;
  const doc = room.doc;
  let sendReply = false;
  switch (messageType) {
    // sync step 1 and 2
    case MessageType.Sync: {
      encoding.writeVarUint(encoder, MessageType.Sync);
      const syncMessageType = syncProtocol.readSyncMessage(
        decoder,
        encoder,
        doc,
        room,
      );
      // sync step 2
      if (
        syncMessageType === syncProtocol.SyncMessageType.Step2 &&
        !room.synced
      ) {
        syncedCallback();
      }
      // sync step 1
      if (syncMessageType === syncProtocol.SyncMessageType.Step1) {
        sendReply = true;
      }
      break;
    }

    // reply with awareness to queryAwareness
    case MessageType.QueryAwareness:
      encoding.writeVarUint(encoder, MessageType.Awareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          awareness,
          Array.from(awareness.getStates().keys()),
        ),
      );
      sendReply = true;
      break;

    // handle incoming awareness data
    case MessageType.Awareness:
      awarenessProtocol.applyAwarenessUpdate(
        awareness,
        decoding.readVarUint8Array(decoder),
        room,
      );
      break;

    case MessageType.BcPeerId: {
      const add = decoding.readUint8(decoder) === 1;
      const peerName = decoding.readVarString(decoder);
      if (
        peerName !== room.peerId &&
        ((room.bcConns.has(peerName) && !add) ||
          (!room.bcConns.has(peerName) && add))
      ) {
        const removed: string[] = [];
        const added: string[] = [];
        if (add) {
          room.bcConns.add(peerName);
          added.push(peerName);
        } else {
          room.bcConns.delete(peerName);
          removed.push(peerName);
        }
        room.provider.emit("peers", [
          {
            added,
            removed,
            trysteroPeers: Array.from(Object.keys(room.trysteroConns)),
            bcPeers: Array.from(room.bcConns),
          },
        ]);
        broadcastBcPeerId(room);
      }

      break;
    }

    default:
      console.error("Unable to compute message");
      return encoder;
  }
  if (!sendReply) {
    // nothing has been written, no answer created
    return null;
  }
  return encoder;
};

// read a message from a peer and emit it
export const readPeerMessage = (
  peerConn: TrysteroConn,
  buf: Uint8Array,
): encoding.Encoder => {
  const room = peerConn.room;
  return readMessage(room, buf, () => {
    peerConn.synced = true;
    checkIsSynced(room);
  });
};

// check if all peers are synced
export const checkIsSynced = (room: Room) => {
  let synced = true;
  Array.from(Object.keys(room.trysteroConns)).forEach((peer) => {
    if (!peer.synced) {
      synced = false;
    }
  });
  if ((!synced && room.synced) || (synced && !room.synced)) {
    room.synced = synced;
    room.provider.emit("synced", [{ synced }]);
  }
};

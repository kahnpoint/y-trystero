import * as bc from "lib0/broadcastchannel";
import * as encoding from "lib0/encoding";

import * as cryptoutils from "./cryptoutils";

import { MessageType, PeerId } from "./types";
import { Room } from "./Room";
//import { TrysteroConn } from './TrysteroConn'
import { TrysteroProvider } from "./Provider";
////import { publishSignalingMessage } from './checkIsSynced'
//import { signalingConns } from './connectionMaps'
import { TargetPeers } from "trystero";

// send a message to a peer
export const sendTrysteroConn = (
  room: Room,
  trysteroPeer: PeerId,
  encoder: encoding.Encoder,
) => {
  try {
    room.sendYjsMessage(encoding.toUint8Array(encoder), trysteroPeer);
  } catch (e) {}
};

// broadcast a message to all peers in the room
export const broadcastTrysteroConn = (
  room: Room,
  encoder: encoding.Encoder,
) => {
  room.sendYjsMessage(encoding.toUint8Array(encoder));
};

// broadcast an encrypted message to all other tabs
export const broadcastBcMessage = (room: Room, encoder: encoding.Encoder) =>
  cryptoutils
    .encrypt(encoding.toUint8Array(encoder), room.key)
    .then((data) => room.mux(() => bc.publish(room.name, data)));

// broadcast a message to all peers in the room
export const broadcastRoomMessage = (room: Room, encoder: encoding.Encoder) => {
  //console.log('broadcastRoomMessage', encoding.toUint8Array(encoder))
  // if the document is open in other tabs, broadcast the message via broadcastchannel
  if (room.bcconnected) {
    broadcastBcMessage(room, encoder);
  }
  // then, broadcast the message to all peers in the room
  broadcastTrysteroConn(room, encoder);
};

// broadcast peerId via broadcastchannel
export const broadcastBcPeerId = (room: Room) => {
  if (room.provider.filterBcConns) {
    // broadcast peerId via broadcastchannel
    const encoderPeerIdBc = encoding.createEncoder();
    encoding.writeVarUint(encoderPeerIdBc, MessageType.BcPeerId);
    encoding.writeUint8(encoderPeerIdBc, 1);
    encoding.writeVarString(encoderPeerIdBc, room.peerId);
    broadcastBcMessage(room, encoderPeerIdBc);
  }
};

// emit connection status
export const emitStatus = (provider: TrysteroProvider) => {
  provider.emit("status", [
    {
      connected: provider.connected,
    },
  ]);
};

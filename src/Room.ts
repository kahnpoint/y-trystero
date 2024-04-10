import * as bc from "lib0/broadcastchannel";
import * as encoding from "lib0/encoding";
import { createMutex } from "lib0/mutex";
import * as random from "lib0/random";

import * as Y from "yjs"; // eslint-disable-line

import { awarenessProtocol, syncProtocol } from "@/trust/protocols";

import { MessageType } from "./types";
import { TrysteroProvider } from "./TrysteroProvider";
import { rooms } from "./connectionMaps";
import * as cryptoutils from "./cryptoutils";
import { checkIsSynced, readMessage } from "./messagesRead";
import {
  broadcastBcMessage,
  broadcastBcPeerId,
  broadcastRoomMessage,
  sendTrysteroConn,
} from "./messagesSend";

import {
  joinRoom,
  Room as TrysteroRoom,
  ActionSender,
  ActionReceiver,
  DataPayload,
} from "trystero";

export class Room {
  peerId: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  provider: TrysteroProvider;
  synced: boolean;
  name: string;
  key: CryptoKey | null;
  bcConns: Set<string>;
  mux: any;
  bcconnected: boolean;

  // callbacks
  _bcSubscriber: (data: ArrayBuffer) => void;
  _docUpdateHandler: (update: Uint8Array, _origin: any) => void;
  _awarenessUpdateHandler: (changed: any, _origin: any) => void;
  _beforeUnloadHandler: () => void;

  // the raw trystero room
  trysteroRoom: TrysteroRoom;
  trysteroConns: Record<string, RTCPeerConnection>;

  // functions to send and receive messages
  sendYjsMessage: ActionSender<DataPayload>;
  getYjsMessage: ActionReceiver<DataPayload>;

  constructor(
    doc: Y.Doc,
    provider: TrysteroProvider,
    name: string,
    key: CryptoKey | null,
  ) {
    this.peerId = random.uuidv4(); // this needs to be a random string
    this.doc = doc;
    this.awareness = provider.awareness;
    this.provider = provider;
    this.synced = false;
    this.name = name;
    this.key = key;
    this.bcConns = new Set();
    this.mux = createMutex();
    this.bcconnected = false;

    // create a trystero room
    const config = { appId: provider.appId, password: provider.password };
    this.trysteroRoom = provider.joinRoom(config, name);

    // create actions for sending and receiving messages
    const [sendYjsMessage, getYjsMessage] =
      this.trysteroRoom.makeAction("yjs-message");
    this.sendYjsMessage = sendYjsMessage;
    this.getYjsMessage = getYjsMessage;

    this.getYjsMessage((data, peerId) => {
      const message = readMessage(this, data, () => {});
      if (message) {
        broadcastRoomMessage(this, message);
      }
    });

    // set the trysteroConns object
    this.trysteroConns = this.trysteroRoom.getPeers();

    // actions for when a peer joins the room
    this.trysteroRoom.onPeerJoin((peerId) => {
      this.trysteroConns = this.trysteroRoom.getPeers();
      this.trysteroConns[peerId].connected = true;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MessageType.Sync);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      sendTrysteroConn(this, peerId, encoder);
      const awarenessStates = this.awareness.getStates();
      if (awarenessStates.size > 0) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.Awareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(
            this.awareness,
            Array.from(awarenessStates.keys()),
          ),
        );
        sendTrysteroConn(this, peerId, encoder);
      }
    });

    // actions for when a peer leaves the room
    this.trysteroRoom.onPeerLeave((peerId) => {
      this.trysteroConns = this.trysteroRoom.getPeers();
      this.provider.emit("peers", [
        {
          removed: [peerId],
          added: [],
          trysteroPeers: Array.from(Object.keys(this.trysteroConns)),
          bcPeers: Array.from(this.bcConns),
        },
      ]);
      checkIsSynced(this);
    });
    console.log("conns", this.trysteroConns);

    // Listens to broadcastchannel messages
    this._bcSubscriber = (data) =>
      cryptoutils.decrypt(new Uint8Array(data), key).then((m) =>
        this.mux(() => {
          const reply = readMessage(this, m, () => {});
          if (reply) {
            broadcastBcMessage(this, reply);
          }
        }),
      );

    // Listens to Yjs updates and sends them to remote peers
    this._docUpdateHandler = (update: Uint8Array, _origin: any) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MessageType.Sync);
      syncProtocol.writeUpdate(encoder, update);
      broadcastRoomMessage(this, encoder);
    };

    // Listens to Awareness updates and sends them to remote peers
    this._awarenessUpdateHandler = (
      { added, updated, removed },
      _origin: any,
    ) => {
      // combine updated clients into a single array
      const changedClients = added.concat(updated).concat(removed);
      const encoderAwareness = encoding.createEncoder();
      encoding.writeVarUint(encoderAwareness, MessageType.Awareness);
      encoding.writeVarUint8Array(
        encoderAwareness,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
      );
      broadcastRoomMessage(this, encoderAwareness);
    };

    // disconnect from all rooms on window unload
    this._beforeUnloadHandler = () => {
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        [doc.clientID],
        "window unload",
      );
      rooms.forEach((room) => {
        room.disconnect();
      });
    };

    // Registering event listeners
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this._beforeUnloadHandler);
    } else if (typeof process !== "undefined") {
      process.on("exit", this._beforeUnloadHandler);
    }
  }

  connect() {
    this.doc.on("update", this._docUpdateHandler);
    this.awareness.on("update", this._awarenessUpdateHandler);

    // broadcast peerId via broadcastchannel
    bc.subscribe(this.name, this._bcSubscriber);
    this.bcconnected = true;
    broadcastBcPeerId(this);

    // write sync step 1
    const encoderSync = encoding.createEncoder();
    encoding.writeVarUint(encoderSync, MessageType.Sync);
    syncProtocol.writeSyncStep1(encoderSync, this.doc);
    broadcastBcMessage(this, encoderSync);

    // broadcast local state
    const encoderState = encoding.createEncoder();
    encoding.writeVarUint(encoderState, MessageType.Sync);
    syncProtocol.writeSyncStep2(encoderState, this.doc);
    broadcastBcMessage(this, encoderState);

    // write queryAwareness
    const encoderAwarenessQuery = encoding.createEncoder();
    encoding.writeVarUint(encoderAwarenessQuery, MessageType.QueryAwareness);
    broadcastBcMessage(this, encoderAwarenessQuery);

    // broadcast local awareness state
    const encoderAwarenessState = encoding.createEncoder();
    encoding.writeVarUint(encoderAwarenessState, MessageType.Awareness);
    encoding.writeVarUint8Array(
      encoderAwarenessState,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, [
        this.doc.clientID,
      ]),
    );
    broadcastBcMessage(this, encoderAwarenessState);
  }

  disconnect() {
    //this.sendYjsMessage({ type: 'unsubscribe', topics: [this.name] })

    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.doc.clientID],
      "disconnect",
    );

    // broadcast peerId removal via broadcastchannel
    const encoderPeerIdBc = encoding.createEncoder();
    encoding.writeVarUint(encoderPeerIdBc, MessageType.BcPeerId);
    encoding.writeUint8(encoderPeerIdBc, 0); // remove peerId from other bc peers
    encoding.writeVarString(encoderPeerIdBc, this.peerId);
    broadcastBcMessage(this, encoderPeerIdBc);

    bc.unsubscribe(this.name, this._bcSubscriber);
    this.bcconnected = false;
    this.doc.off("update", this._docUpdateHandler);
    this.awareness.off("update", this._awarenessUpdateHandler);

    // leave the room
    bc.unsubscribe(this.name, () => {});
    this.trysteroRoom.leave();
  }

  destroy() {
    this.disconnect();
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this._beforeUnloadHandler);
    } else if (typeof process !== "undefined") {
      process.off("exit", this._beforeUnloadHandler);
    }
  }
}

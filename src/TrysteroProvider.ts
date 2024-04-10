import * as map from "lib0/map";
import * as math from "lib0/math";
import { ObservableV2 } from "lib0/observable";
import * as promise from "lib0/promise";
import * as random from "lib0/random";
import * as Y from "yjs"; // eslint-disable-line
import { awarenessProtocol } from "../protocols";
import * as cryptoutils from "./cryptoutils";
import { Room } from "./Room";
//import { SignalingConn } from './archive/SignalingConn'
import { emitStatus } from "./messagesSend";
import { rooms } from "./connectionMaps";
import * as error from "lib0/error";
import { joinRoom as joinRoomBittorrent } from "trystero/torrent";

type TrysteroProviderEvents = {
  status: (arg: { connected: boolean }) => void;
  synced: (arg: { synced: boolean }) => void;
  peers: (arg: {
    added: string[];
    removed: string[];
    trysteroPeers: string[];
    bcPeers: string[];
  }) => void;
};

type ProviderOptions = {
  password?: string;
  awareness?: awarenessProtocol.Awareness;
  filterBcConns?: boolean;
  peerOpts?: any;
  appId?: string;
  maxConns?: number;
  joinRoom?: typeof joinRoom;
};

export class TrysteroProvider extends ObservableV2<TrysteroProviderEvents> {
  awareness: awarenessProtocol.Awareness;
  doc: Y.Doc;
  filterBcConns: boolean;
  shouldConnect: boolean;
  maxConns: number;
  peerOpts: any;
  room: Room | null;
  roomName: string;
  appId: string;
  password: string;
  key: PromiseLike<CryptoKey | null>;
  joinRoom: typeof joinRoomBittorrent;

  constructor(
    roomName: string,
    doc: Y.Doc,
    {
      appId = "yjs-trystero",
      password = "default",
      awareness = new awarenessProtocol.Awareness(doc),
      maxConns = 20 + math.floor(random.rand() * 15), // the random factor reduces the chance that n clients form a cluster
      filterBcConns = true,
      peerOpts = {}, // simple-peer options. See https://github.com/feross/simple-peer#peer--new-peeropts
      joinRoom = joinRoomBittorrent,
    } = {} as ProviderOptions,
  ) {
    super();
    // set room info
    this.appId = appId;
    roomName = `${appId}-${roomName}`;
    this.roomName = roomName;
    this.password = password;
    this.key = password
      ? cryptoutils.deriveKey(password, roomName)
      : promise.resolve(null);

    // yjs objects
    this.doc = doc;
    this.awareness = awareness;

    // preferences
    this.filterBcConns = filterBcConns;
    this.shouldConnect = false;
    this.maxConns = maxConns;
    this.peerOpts = peerOpts;
    this.joinRoom = joinRoom;

    // create the room
    this.room = null;
    this.key.then((key) => {
      // check if room already exists
      if (rooms.has(roomName)) {
        throw error.create(
          `A Yjs Doc connected to room "${roomName}" already exists!`,
        );
      }
      // create the room
      this.room = new Room(doc, this, roomName, key);
      // add room to rooms map
      rooms.set(roomName, this.room);

      // connect or disconnect room
      if (this.shouldConnect) {
        this.room.connect();
      } else {
        this.room.disconnect();
      }
      emitStatus(this);
    });

    // connect
    this.connect();

    // set up destroy handler
    this.destroy = this.destroy.bind(this);
    doc.on("destroy", this.destroy);
  }

  // get connected status
  get connected(): boolean {
    return this.room !== null && this.shouldConnect;
  }

  // connect to the room
  connect() {
    this.shouldConnect = true;
    if (this.room) {
      this.room.connect();
      emitStatus(this);
    }
  }

  // disconnect from the room
  disconnect() {
    this.shouldConnect = false;
    if (this.room) {
      this.room.disconnect();
      emitStatus(this);
    }
  }

  // destroy the room
  destroy() {
    this.doc.off("destroy", this.destroy);
    // need to wait for key before deleting room
    this.key.then(() => {
      this.room.destroy();
      rooms.delete(this.roomName);
    });
    super.destroy();
  }
}

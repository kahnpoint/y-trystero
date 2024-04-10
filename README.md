# Y-Trystero

_(Not affiliated with either [Yjs](https://github.com/yjs/yjs) or [Trystero](https://github.com/dmotz/trystero))_

Use Trystero as the backend for Yjs!
This allows for using decentralized signaling servers (currently Bittorrent, IPFS, Nostr, or MQTT) to sync Yjs documents.

Usage is similar to the WebRTC provider:

```javascript
import * as Y from "yjs";
import { TrysteroProvider } from "y-trystero";

const ydoc = new Y.Doc();
const provider = new TrysteroProvider("your-room-name", ydoc, {
  password: "optional-password",
});

// use as normal
const yarray = ydoc.get("array", Y.Array);
```

The options support two additional optional fields:

- joinRoom: an alternative Trystero joinRoom function (all 4 are reexported in the `y-trystero` package)
- appId: passed through to Trystero

```javascript
import { joinRoom } from "y-trystero/ipfs";

const provider = new TrysteroProvider("your-room-name", ydoc, {
  appId: "your-app-name", // optional, but recommended
  joinRoom: joinRoom,
});
```

TODO: 
- [ ] Tests
- [ ] Demo

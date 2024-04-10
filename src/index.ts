import { TrysteroProvider } from "./Provider";

export { TrysteroProvider };

/*
yjs usage

import * as Y from 'yjs'
import { TrysteroProvider } from 'y-trystero'

const ydoc = new Y.Doc()
// clients connected to the same room-name share document updates
const provider = new TrysteroProvider('your-room-name', ydoc, { password: 'optional-room-password' })
const yarray = ydoc.get('array', Y.Array)

*/

/*
trystero usage

import {joinRoom} from 'trystero'

const config = {appId: 'san_narciso_3d'}
const room = joinRoom(config, 'yoyodyne')

room.onPeerJoin(peerId => console.log(`${peerId} joined`))

room.onPeerLeave(peerId => console.log(`${peerId} left`))

const [sendDrink, getDrink] = room.makeAction('drink')

// buy drink for a friend
sendDrink({drink: 'negroni', withIce: true}, friendId)

// buy round for the house (second argument omitted)
sendDrink({drink: 'mezcal', withIce: false})

// listen for drinks sent to you
getDrink((data, peerId) =>
  console.log(
    `got a ${data.drink} with${data.withIce ? '' : 'out'} ice from ${peerId}`
  )
)

room.leave()


*/

import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

export const messagePermissionDenied: number = 0

export const writePermissionDenied = (
	encoder: encoding.Encoder,
	reason: string
): void => {
	encoding.writeVarUint(encoder, messagePermissionDenied)
	encoding.writeVarString(encoder, reason)
}

export type PermissionDeniedHandler = (y: any, reason: string) => void

export const readAuthMessage = (
	decoder: decoding.Decoder,
	y: Y.Doc,
	permissionDeniedHandler: PermissionDeniedHandler
): void => {
	switch (decoding.readVarUint(decoder)) {
		case messagePermissionDenied:
			permissionDeniedHandler(y, decoding.readVarString(decoder))
	}
}

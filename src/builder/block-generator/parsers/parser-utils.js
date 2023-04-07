'use strict'

// import  from '../../generator-config'
import { stringStartsWith } from '../../../lib/utils.js'

import { stringFilters } from '../../generator-config.js'

export function parseMagicKeyword( magicKeyword ) {
	const rx = stringFilters.magicKeywords
	const data = [ ...magicKeyword.matchAll( rx ) ]
	const [ __, property, divider, metaKey ] = data[ 0 ]

	let propertyName = property, variable
	if ( stringStartsWith( property, '$' ) ) {
		propertyName = property.slice( 1 )
		variable = property
	}

	const operation =
	( divider === '::' && 'meta' )
	|| ( divider === '.' && 'get' )

	const meta = {
		path: [ property ],
		magicProperty: undefined,
		operation,
		magicKeyword,
		property: propertyName,
		metaKey,
		variable,
	}

	if ( operation === 'get' ) {
		// const rx = /[[]%([\w\d_]+)[\\]]/i
		// todo: use better rx
		const rxg = /\[(.*)\]/
		const varInKey = metaKey.match( rxg )

		if ( varInKey ) {
			const varInfo = parseMagicKeyword( varInKey[ 1 ] )
			meta.magicProperty = varInfo

			return meta
		}

		meta.path = [ property, metaKey ]
	}

	return meta
}

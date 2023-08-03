'use strict'

const log = console.log.bind( console )

const delay = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) )

/**
 * Convert kebab case (kebab_case) to camel case (camelCase).
 * @param {string} string Kebab case string
 */
function kebabToCamelCase( string ) {
	const rx = /[_](.?)/ig
	const res = string.replaceAll( rx, ( __, p1 ) => {
		return p1.toUpperCase()
	} )

	return res[ 0 ].toLowerCase() + res.slice( 1 )
}

/**
 * Object literal check with type guard.
 *
 * @param {*} obj
 * @return { obj is JSO<unknown> & JSO<any>} Return both `JSO<unknown>` & `JSO<any>`, because TS can't distinguish between `JSO<any>` and `any[]`
 */
function isObj( obj ) {
	return obj && Object( obj ) === obj && ! Array.isArray( obj )
}

/**
 * Object.entries().reduce() for all types of objects. Type safe.
 *
 * @template {Record<InputKeys, Values>|Values[]} Input
 * @template {string} InputKeys
 * @template {*} Values
 * @template {JSO|any[]} Target extends {} ? JSO : any[]
 * @template {[InputKeys, Input[InputKeys extends keyof Input ? InputKeys : never]]} CurrentValue
 * @param {Input} obj - Input object
 * @param {(accumulator: Target, currentValue: CurrentValue, index?: number) => Target } reduceFn - Reducer function
 * @param {Target} [target] Optional target object, defaults to new object
 * @return {FilterMissingTypeArg<Target> extends never ? Target extends any[] ? any[] : JSO : Target}
 */
function reducer( obj, reduceFn, target = Object.create( {} ) ) {
	const _target = /** @type {Target} */( target )

	// TS is not happy about just assigning {}
	const r = Object.entries( obj ).reduce( reduceFn, _target )

	// @ts-ignore
	return r
}

/**
 * Simplified object reducer. Walk through and mutate object with Object.entries().reduce(). Type safe.
 *
 * @template {Record<InputKeys, Values>|Values[]} Input
 * @template {string} InputKeys
 * @template {any} Values
 * @template {[InputKeys, Input[InputKeys extends keyof Input ? InputKeys : never]]} CurrentValue
 * @param {Input} obj - Input object
 * @param {(accumulator: Input, currentValue: [InputKeys, any], index?: number) => void } func - Function to apply
 */
function objWalk( obj, func ) {
	/**
	 * @param {Input} result
	 * @param {CurrentValue} item
	 */
	const reduceFn = ( result, item ) => {
		func( result, item )
		return result
	}

	return Object.entries( obj ).reduce( reduceFn, obj )
}

/**
 * Check if an object contains any of the keys in an array.
 *
 * @param {Record<string, any>} obj
 * @param  {...any} element
 */
function hasKeysAny( obj, ...element ) {
	return element.some( ( x ) => x in obj )
}

/**
 * Merge arrays and deduplicate values.
 *
 * @param {any[]} target
 * @param  {...any} sources Can be an array or a single value
 * @returns
 */
function arrayMerge( target, ...sources ) {
	sources.forEach( ( source ) => {
		target = [ ...target, ...source ]
	} )
	const deduplicatedArray = new Set( [ ...target ] )
	return [ ...deduplicatedArray ]
}

/**
 * Extract and remove elements from an array by reference.
 *
 * Note! Mutates original array!
 *
 * Example testfunc: (x) => x !== null
 *
 * @param {any[]} array Array to search and operate on
 * @param {Function} testFunc Filter function for array elements to remove
 * @return {any[]} New array of extracted elements.
 */
function extractArrayElements( array, testFunc, newArray = [], i = 0 ) {
	if ( i >= array.length ) {
		return newArray
	}

	const el = array[ i ]
	if ( testFunc( el ) ) {
		array.splice( i, 1 )
		newArray.push( el )
	}
	else {
		i++
	}

	return extractArrayElements( array, testFunc, newArray, i )
}

/**
 * Remove elements of one array from another.
 *
 * Note: Mutates original array!
 *
 * @param {any[]} array
 * @param {any[]} removeElements
 * @return {any[]} New array
 */
function removeArrayElements( array, removeElements ) {
	removeElements.forEach( ( x ) => {
		const i = array.indexOf( x )
		if ( i > -1 ) {
			array.splice( i, 1 )
		}
	} )
	return array
}

function removeObjectKeys( obj, removeElements ) {
	removeElements.forEach( ( x ) => {
		if ( x in obj ) {
			delete obj[ x ]
		}
	} )
	return obj
}

/**
 * Replace all placeholders surrounded by brackets inside a string.
 *
 * ---
 * **Options**
 *
 * `brackets`: {string | string[]} - Single start/stop bracket (`"%"`) or different start and stop brackets (`["{{", "}}"]`)
 *
 * `restrictChars`: {boolean} - Use limited set of characters
 *
 * `removeUnmatched`: {boolean} - Remove unmatched placeholders, or leave alone
 *
 * ---
 * @template {string} InputString
 * @param {InputString} inputString - String to search
 * @param {JSO<string|number>} variables - Key-value list of variables and values
 * @param {Object} props Options
 * @param {string | string[] } [props.brackets] - Single start/stop bracket ("%") or different start and stop brackets (["{{", "}}"])
 * @param {boolean} [props.restrictChars] - Use limited set of characters
 * @param {boolean} [props.removeUnmatched] - Remove unmatched placeholders, or leave alone
 * @param {boolean} [props.throwErrors] - Throw on error
 * @return {InputString}
 */
function resolveTemplateStrings( inputString, variables, { brackets = [ '{{', '}}' ], restrictChars = true, removeUnmatched = false, throwErrors = false } = {} ) {
	if ( typeof inputString !== 'string' ) {
		return inputString
	}

	const [ bracketLeft, bracketRight ] = Array.isArray( brackets ) ? brackets : [ brackets, brackets ]

	let allowedChars

	if ( restrictChars ) {
		allowedChars = '\\w\\-_\\.$'
	}
	else {
		// Allow all except bracket chars
		const chars = new Set( [ ...bracketLeft, ...bracketRight ] )
		allowedChars = `^${ [ ...chars ].join( '' ) }`
	}

	const rx = new RegExp( `${ bracketLeft }([${ allowedChars }]*)${ bracketRight }`, 'gi' )

	// @ts-ignore
	return inputString.replace( rx, ( _expr, key ) => {
		if ( Object( variables[ key ] ) === variables[ key ] ) {
			const errStr = `${ key }: Template variable cannot be an object.` // '[INVALID TEMPLATE VARIABLE: OBJECT]'

			if ( throwErrors ) {
				throw new Error( errStr )
			}
			return `[${ errStr.toUpperCase() }]`
		}
		return variables[ key ] ?? ( removeUnmatched
			? '' : `${ bracketLeft }${ key }${ bracketRight }`
		)
	} )
}

/**
 * Replace all placeholders surrounded by brackets in both keys and string values. Works on objects and arrays.
 *
 * ! NOTE: **not proxy safe!**
 *
 * ---
 * @template {JSO} Source
 * @param {Source} source
 * @param {JSO} variables Object containing placeholders and replacement values.
 * @param {Object} props Options
 * @param {string | string[] } [props.brackets] - Single start/stop bracket ("%") or different start and stop brackets (["{{", "}}"])
 * @param {boolean} [props.restrictChars] - Use limited set of characters
 * @param {boolean} [props.mutateSource] - Mutate source object?
 * @param {boolean} [props.removeUnmatched] - Remove unmatched placeholders, or leave alone
 * @param {boolean} [props.accumulateErrors] - Tolerate errors, but save them and throw when exiting last recursion. Must be used in combination with `mutateSource`
 * @param {string[]} [errors] - Accumulated errors, if enabled
 * @return {Source}
 */
function resolveTemplateStringsRecursively( source, variables, { brackets = [ '{{', '}}' ], restrictChars = true, mutateSource = false, removeUnmatched = false, accumulateErrors = false } = {}, errors = undefined ) {
	let entrypoint = false
	if ( accumulateErrors && errors === undefined ) {
		entrypoint = true
		errors = []
	}

	let target

	if ( Array.isArray( source ) ) {
		target = mutateSource ? source : []

		source.reduce( ( result, value, key ) => {
			try {
				if ( Object( value ) === value ) {
					result[ key ] = resolveTemplateStringsRecursively( value, variables, { brackets, removeUnmatched, restrictChars, accumulateErrors }, errors )
				}
				else {
					result[ key ] = resolveTemplateStrings( value, variables, { brackets, removeUnmatched, restrictChars, throwErrors: accumulateErrors } )
				}
			}
			catch ( err ) {
				if ( accumulateErrors ) {
					errors.push( err )
					result[ key ] = 'ERROR!'
				}
			}
			return result
		}, target )
	}
	else {
		const entries = Object.entries( source )

		if ( ! entries.length ) {
			return source
		}

		target = mutateSource ? source : /** @type {Source} */ ( {} )
		entries.reduce( ( result, [ key, value ] ) => {
			try {
			/** @type {keyof Source} */
				const _key = resolveTemplateStrings( key, variables, { brackets, removeUnmatched, restrictChars, throwErrors: accumulateErrors } )

				if ( _key !== key ) {
					delete result[ key ]
				}

				const _value = Object( value ) === value
					? resolveTemplateStringsRecursively( value, variables, { brackets, removeUnmatched, restrictChars, mutateSource: true, accumulateErrors }, errors )
					: resolveTemplateStrings( value, variables, { brackets, removeUnmatched, restrictChars, throwErrors: accumulateErrors } )

				result[ _key ] = _value
			}
			catch ( err ) {
				if ( accumulateErrors ) {
					errors.push( err.message )

					// @ts-ignore
					result[ key ] = 'ERROR - INVALID VARIABLE!'
				}
			}

			return result
		}, target )
	}

	if ( entrypoint && errors.length ) {
		throw new Error( `Errors occurred while substituting template strings:\n\n# ${ errors.join( '\n# ' ) }\n` )
	}

	// @ts-ignore
	return target
}

/**
 * Replace whole string if it matches a key in a key-value set.
 *
 * @param {string} value
 * @param {JSO} vars
 * @return Returns the value encapsulated in an object.
 */
function replaceValue( value, vars ) {
	if ( typeof value !== 'string' ) {
		return { value }
	}
	// If value matches variable
	else if ( value in vars ) {
		return { value: vars[ value ] }
	}
}

/**
 * Resolve variable dependencies, i.e. variables defined by other variables.
 *
 * @param {JSO} obj
 * param {JSO} [vars]
 */
function resolveNestedVariables( obj ) {
	/**
	 * Resolve variable dependencies, i.e. variables defined by other variables.
	 *
	 * @param {JSO} src
	 * @param {JSO} vars
	 */
	const resolver = ( src, vars ) => {
		return Object.entries( src ).reduce( ( result, [ key, value ] ) => {
			if ( Object( value ) === value ) {
				result[ key ] = resolver( value, vars )
			}
			else if ( value in vars ) {
				const _value = replaceValue( value, vars )
				result[ key ] = _value && 'value' in _value ? _value.value : value
			}

			return result
		}, src )
	}

	return resolver( obj, obj )
}

/**
 * Resolve variables/references in object values.
 *
 * @template {JSO|any[]} Source
 * @param {Source} source An object literal
 * @param {JSO<string>} values Object literal mapping variables to values
 * @param {{ removeMissing?: boolean, flattenArrays?: boolean, mutateSource?: boolean, resolveNestedVars?: boolean, variablePrefix?: string }} options
 * @return {Source}
 */
function resolveRefsRecursively( source, values, { removeMissing = false, flattenArrays = true, mutateSource = false, resolveNestedVars = false, variablePrefix = '$' } = {} ) {
	if ( Object( source ) !== source ) {
		return source
	}

	if ( resolveNestedVars ) {
		resolveNestedVariables( values )
	}

	if ( Object( source ) !== source ) {
		console.log( { source } )
		throw new Error( 'resolveRefsRecursively: source is not an object.' )
	}

	if ( Array.isArray( source ) ) {
		const arr = Object.keys( source ).reduce( ( result, key ) => {
			const value = source[ key ]

			if ( Object( value ) === value ) {
				// Recurse
				result.push( resolveRefsRecursively( value, values, { removeMissing } ) )
			}
			else {
				// Replacement happens here
				const newValue = replaceValue( value, values )

				// If replacement happened
				if ( newValue && 'value' in newValue ) {
					if ( flattenArrays && Array.isArray( newValue.value ) ) {
						result.push( ...newValue.value )
					}
					else {
						result.push( newValue.value )
					}
				}
				// If variable still present
				else if ( value.slice( 0, variablePrefix.length ) === variablePrefix ) {
					if ( ! removeMissing ) {
						result.push( value )
					}
				}
				else {
					result.push( value )
				}
			}
			return result
		}, [] )

		return /** @type {any} */ ( arr )
	}

	const entries = Object.entries( source )

	// This also makes TS to correctly interpret source as an object literal below
	if ( ! entries.length || ! isObj( source ) ) {
		return source
	}

	const target = mutateSource ? source : /** @type {typeof source} */( {} )

	return entries.reduce( ( result, [ key, value ] ) => {
		if ( Object( value ) === value ) {
			result[ key ] = resolveRefsRecursively( value, values, { removeMissing, mutateSource: true } )
			return result
		}

		const _value = replaceValue( value, values )

		if ( _value && 'value' in _value ) {
			result[ key ] = _value.value
		}
		// Does the value look like a variable?
		else if ( value.slice( 0, variablePrefix.length ) === variablePrefix ) {
			// Should source props with missing variables be removed?
			if ( mutateSource ) {
				if ( removeMissing ) {
					delete result[ key ]
				}
			}
			else if ( ! removeMissing ) {
				result[ key ] = value
			}
		}
		else {
			result[ key ] = value
		}

		return result
	}, target )
}

function stringStartsWith( string, compare ) {
	return string.slice( 0, compare.length ) === compare
}

function stringHasPrefix( prefix, string ) {
	return string.substring( 0, prefix.length ) === prefix
}

function recursivePrefixer( obj, prefix, { prefixKeys = true, prefixValues = false } = {} ) {
	return Object.entries( obj ).reduce( ( result, [ key, value ] ) => {
		if ( ! stringHasPrefix( prefix, key ) ) {
			key = `${ prefix }${ key }`
		}
		result[ key ] = value
		return result
	}, {} )
}

export function ProxyObj( data, rootElements = undefined ) {
	return new Proxy( data, {
		get( target, prop ) {
			if ( ! ( prop in target && ( ! rootElements || rootElements.includes( prop ) ) ) ) {
				target[ prop ] = {}
			}
			return target[ prop ]
		},
		set( target, prop, val ) {
			if ( ! ( prop in target && ( ! rootElements || rootElements.includes( prop ) ) ) ) {
				target[ prop ] = {}
			}
			target[ prop ] = val
			return true
		},
	} )
}

export function ProxyReadOnly(
	data,
	{ throwOnError = true, errorMsgConstructor = undefined } = {},
) {
	return new Proxy( data, {
		set( _target, prop, value ) {
			const error = errorMsgConstructor
				? errorMsgConstructor( prop, value )
				: `Data element is read only. (attempted to set property '${ typeof prop === 'string' ? prop : '<symbol>' }').`

			if ( throwOnError ) {
				throw new Error( error )
			}

			console.error( error )
			return false
		},
	} )
}

export { arrayMerge, delay, extractArrayElements, isObj, kebabToCamelCase, camelToKebabCase, log, hasKeysAny, reducer, stringHasPrefix, recursivePrefixer, removeArrayElements, removeObjectKeys, replaceValue, resolveTemplateStrings, resolveTemplateStringsRecursively, resolveRefsRecursively, resolveNestedVariables, stringStartsWith, objWalk }

'use strict'

function log( ...msg ) {
	console.log( ...msg )
}

/**
 * Merge arrays and deduplicate values.
 *
 * @param {any[]} target
 * @param  {...any} sources Can be an array or a single value
 * @returns
 */
function arrayDeduplicate( target, ...sources ) {
	sources.forEach( ( source ) => {
		target = [ ...target, ...source ]
	} )
	const deduplicatedArray = new Set( [ ...target ] )
	return [ ...deduplicatedArray ]
}

/**
 * Get node command line arguments.
 *
 * Syntax: [flag] [flag!] [arg:value]
 *
 * [flag] Set keyword 'flag' to true
 * [flag!] Set keyword 'flag' to false
 * [arg:value] Set keyword 'arg' equal to 'value'
 *
 * Example:
 * place:"Ankh Morpork" isCity population:1000000
 * place:Leshp isCity! population:0
 *
 * Valid value types: {string|number|boolean}
 * Some characters must be quoted: (space), : (colon), - (dash)
 * Types are inferred unless quoted.
 *
 * Note: using -- does not work, e.g. npm run build --argument. the --%string% is eaten by npm. A workaround is doing npm run build -- --argument,.e.g. by prepending --.
 *
 * @param {string[]?} argv
 */
function getArgs( argv ) {

	if ( ! argv ) {
		argv = process.argv
	}

	// First two values are paths
	let _argv = argv.slice( 2 )

	const rxArgSplit = /^([a-z_]+[a-z0-9_]*)([!:]?)(.*)/i
	const rxValidValue = /^([a-z0-9_'"`])/i
	const rxQuotes = /^(['"`])/

	const args = _argv.reduce( ( _args, argSet ) => {
		const match = argSet.match( rxArgSplit )

		if ( ! match ) {
			throw new Error( `\n\n------------------------------\nInvalid argument (${ argSet }).\nArgument name must begin with a letter or underscore.\n------------------------------\nProgram terminated.\n\n` )
		}

		match.shift()
		const [ keyword, operator, value ] = match

		if ( operator === ':' ) {
			if ( ! rxValidValue.test( value ) ) {
				throw new Error( `\n\n------------------------------\nInvalid argument value (${ argSet }).\nArgument value must begin with a letter, number, quote sign or underscore.\n------------------------------\nProgram terminated.\n\n` )
			}

			const valueQuote = value.match( rxQuotes )

			if ( valueQuote ) {
				if ( value.slice( -1 ) !== valueQuote[ 1 ] ) {
					throw new Error( `\n\n------------------------------\nInvalid argument value (${ argSet }).\nMissing end quote.\n------------------------------\nProgram terminated.\n\n` )
				}
				else {
					_args[ keyword ] = value.slice( 1, -1 )
				}
			}
			else {
				_args[ keyword ] = typeParser( value )
			}
		}
		else {
			_args[ keyword ] = operator !== '!'
		}
		return _args
	}, {} )

	if ( ! Object.keys( args ).length ) {
		return
	}

	return args
}

/**
 * Parse string, boolean and number into valid types.
 *
 * Double quotes are unwrapped.
 *
 * @param {string|number|boolean} value
 */
function typeParser( value ) {
	switch ( true ) {
		case !! Number( value ): return Number( value )
		case String( value ).toLowerCase() === 'true': return true
		case String( value ).toLowerCase() === 'false': return false
	}

	if ( value === `''` || value === `""` ) {
		return ''
	}
	return value
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
function extractArrayElements ( array, testFunc, newArray = [], i = 0 ) {
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

export { arrayDeduplicate, extractArrayElements, getArgs, log, removeArrayElements, removeObjectKeys }

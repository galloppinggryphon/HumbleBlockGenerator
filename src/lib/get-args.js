export function getScriptArgs() {
	let scriptArgs
	try {
		scriptArgs = getArgs()
	}
	catch ( error ) {
		console.error( error.message )
		return
	}

	return scriptArgs
}

/**
 * Parse command line arguments.
 *
 * Syntax: [flag] [!flag] [arg:value]
 *
 * [flag] Set keyword 'flag' to true
 * [!flag] Set keyword 'flag' to false
 * [arg:value] Set keyword 'arg' equal to 'value'
 *
 * Values with special characters, including space, must be quoted. Enclosing quotes are stripped.
 *
 * Types are inferred unless quoted. Accepted types: {string|number|boolean}.
 *
 * Objects must be JSON encoded and quoted.
 *
 * Examples:
 *
 * `place:"Ankh Morpork" isCity population:1000000`
 *
 * `place:Leshp !isCity population:0`
 *
 * `city:'Ankh Morpork' famousInhabitant:Rincewind population:500000 speciesDiverse !plagueFree"`
 *
 * Note: using -- to start a keyword/flag does not work, e.g. `npm run build --argument`. The argument is eaten by npm. A workaround is doing `npm run build -- --argument`,.e.g. by prepending `--`.
 *
 * @param {string[]} [argv] Raw argument list. Default value is process.argv
 * @return {Record<string, string|number|boolean>} Object with key:value pairs
 */
export function getArgs( argv = undefined ) {
	// Must start with alphabetic character, ! or _
	const rxArgSplit = /^([!]?)([a-z_]+[\w]*)([:]?)(.*)/i
	const rxValValidate = /^([\w-]+)/i
	const rxQuotes = /(["'`])((?:(?!\1)[\S\s])*)(\1)/g
	const rxSpecialBrackets = /^%\{([\w]+)\}%$/i

	// ^(['"`])(.*)(\1)$

	if ( argv && ! argv.length ) {
		return {}
	}

	// Get raw arguments from node
	if ( ! argv ) {
		const _argv = process.argv

		// The first two elements are node and script paths
		_argv.splice( 0, 2 )

		if ( ! _argv.length ) {
			return {}
		}

		// Remerge args in case there are quoted strings
		const string = _argv.join( ' ' )

		// Protect quotes during processing
		const safeString = string.replaceAll( rxQuotes, ( quote ) => {
			// Encode special characters and bracket
			const value = utf8ToHex( quote ) // encodeURI( r )
			return `%{${ value }}%`
		} )

		argv = safeString.split( ' ' )
	}

	// log( argv )

	const args = argv.reduce( ( _args, argSet ) => {
		const match = argSet.match( rxArgSplit )

		if ( ! match ) {
			throw new Error( `Invalid argument (${ argSet }): Must begin with letter, underscore (_) or exclamation (!).` )
		}

		// The first element contains the input
		match.shift()

		const [ isFalse, keyword, hasValue, value ] = match

		if ( hasValue && value !== undefined && value !== '' ) {
			// Check if the value has special brackets from earlier
			const quote = value.match( rxSpecialBrackets )

			if ( quote ) {
				const val = hexToUtf8( quote[ 1 ] )
				_args[ keyword ] = val.slice( 1, val.length - 1 )
			}
			else if ( rxValValidate.test( value ) ) {
				_args[ keyword ] = typeParser( value )
			}
			else {
				throw new Error( `Invalid argument value (${ argSet }): must begin with a letter, number or underscore. Special characters, including space, must be quoted.\n` )
			}
		}
		else {
			_args[ keyword ] = ! isFalse
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
export function typeParser( value ) {
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

function StrConvert( from, to ) {
	return ( str ) => Buffer.from( str, from ).toString( to )
}
export function utf8ToHex( str ) {
	return StrConvert( 'utf8', 'hex' )( str )
}
export function hexToUtf8( str ) {
	return StrConvert( 'hex', 'utf8' )( str )
}

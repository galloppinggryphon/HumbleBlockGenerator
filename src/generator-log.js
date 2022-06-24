import chalk from 'chalk'
import { log } from './lib/utils.js'
import { getPermutationName } from './generator-utils.js'

/**
 * Logging factory.
 */
export default function GeneratorLog() {
	const logLevels = {
		error: chalk.redBright( 'ERROR' ),
		warn: chalk.yellowBright( 'WARNING' ),
		notice: chalk.whiteBright( 'NOTICE' ),
	}
	const status = {
		error: false,
		warning: false,
		notice: false,
	}

	const logData = {}
	let context = { fileName: undefined, permutation: undefined, permutationPath: [] }

	const print = {
		error( str ) {
			const item = NewLogMsg( 'error', str )
			log( formatLogItem( item ) )
		},
		section( str ) {
			log( chalk.blueBright( `[${ str }]` ) )
		},
	}

	return {
		print,
		error( message, ...errorData ){
			status.error = true
			return logItem( 'error', message, errorData )
		},
		warn( message, ...errorData ){
			status.warning = true
			return logItem( 'warn', message, errorData )
		},
		notice( message, ...errorData ) {
			status.notice = true
			return logItem( 'notice', message, errorData )
		},
		display() {
			const __log = Object.entries( logData )
			if ( ! __log.length ) {
				return
			}

			if ( status.error ) {
				log()
				log( chalk.bgRedBright( ' WARNING ' ) + chalk.bgWhite( ' Errors occurred during processing! ' ) )
				log()
				log( chalk.yellow( 'One or more blocks/block variants (permutations) could not be processed. They may contain invalid syntax or be incomplete.' ) )
			}
			else if ( status.warning ) {
				log( chalk.yellow( 'Warnings were generated.' ) )
			}

			log( )

			let currentFile
			__log.forEach( ( [ fileName, items ] ) => {
				if ( ! items.length ) {
					return
				}

				if ( fileName !== currentFile ) {
					log()
					print.section( fileName )
					currentFile = fileName
				}

				items.forEach( ( item ) => {
					log( formatLogItem( item ) )
				} )
			} )

		},

		/**
		 * @param {Object} contextData { fileName = undefined, permutationPath = undefined }
		 */
		setContext( contextData ) {
			Object.assign( context, contextData )

			if ( context.permutationPath && context.permutationPath.length ){
				context.permutation = getPermutationName( context.permutationPath, '/' )
			}
			else {
				context.permutation = undefined
			}
		},
		write() {},
	}

	function NewLogMsg( level, msg, errorData = undefined ) {
		let errorDataStr
		if ( errorData && errorData.length ) {
			let _errorData = errorData.length === 1 ? errorData[ 0 ] : errorData
			errorDataStr = JSON.stringify( _errorData, false, 2 )
		}

		return {
			level,
			permutation: context.permutation,
			msg,
			errorData: errorDataStr,
		}
	}

	function logItem( level, msg, errorData ) {
		const store = context.fileName ? context.fileName : ''
		logData[ store ] = logData[ store ] ?? []
		logData[ store ].push( NewLogMsg( level, msg, errorData ) )
		return logData[ store ][ logData[ store ].length - 1 ]
	}

	function formatLogItem( item ) {
		const contextString = item.permutation ? `[${ item.permutation }] ` : ''

		let _item = `${ contextString }${ logLevels[ item.level ] } ⇛  ${ item.msg }`
		_item += item.errorData ? ` Additional error data: \n${ item.errorData }\n` : ''
		return _item
	}
}

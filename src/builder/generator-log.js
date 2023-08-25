import path from 'path'
import chalk from 'chalk'
import _ from 'lodash'

const log = console.log.bind( console )

const NL = '\n'

const logLevels = /** @type {const} */ ( {
	error: 1,
	warn: 2,
	notice: 3,
} )

const stats = {
	errors: 0,
	warnings: 0,
	notices: 0,
}

const logLevelLabels = {
	error: chalk.redBright.bold( 'ERROR' ),
	warn: chalk.yellowBright.bold( 'WARNING' ),
	notice: chalk.cyan.bold( 'NOTICE' ),
}

/**
 * Logging factory.
 */
export default function GeneratorLog() {
	/**
	 * @type {{[store: string]: ReturnType<typeof LogMsg>[]}}
	 */
	const stack = {}
	const current = { store: '', label: '', context: undefined }

	const logHandler = {
		get BLOCK_BUILDER() {
			return 'BLOCK_BUILDER'
		},

		hasMessages( threshold = 3 ) {
			return ( threshold === 1 && stats.errors )
				|| ( threshold === 2 && ( stats.warnings || stats.errors ) )
				|| ( threshold === 3 && ( stats.notices || stats.warnings || stats.errors ) )
		},

		addMsg( level, message, errorData = undefined, stacktrace = undefined ) {
			const item = LogMsg()
			item.create( level, message, errorData, stacktrace )

			const store = current.store || 'default'
			stack[ store ] = stack[ store ] ?? []
			stack[ store ].push( item )

			return item
		},

		/** @throws Throws error if called. */
		fatal( message, ...errorData ) {
			log( '\n\n' )
			log( chalk.bgRedBright.bold( '   FATAL ERROR - PROGRAM ABORTED!   ' ) )

			if ( this.hasMessages() ) {
				log()
				log( chalk.yellow( 'Program log:' ) )
				this.printLogItems()
			}

			log()
			log( chalk.yellow( 'Fatal error:' ) )

			const item = this.addMsg( 'error', message, errorData )
			const parts = item.format( true )
			parts.forEach( ( i ) => log( i ) )

			throw new Error( 'FATAL ERROR! See error info above.' )
		},
		error( message, errorData, stacktrace = undefined ) {
			stats.errors++

			const item = this.addMsg( 'error', message, errorData, stacktrace )
			return item.data
		},
		warn( message, errorData, stacktrace = undefined ) {
			stats.warnings++
			const item = this.addMsg( 'warn', message, errorData, stacktrace )
			return item.data
		},
		notice( message, errorData, stacktrace = undefined ) {
			stats.notices++
			const item = this.addMsg( 'notice', message, errorData, stacktrace )
			return item.data
		},
		printLog( { verbose = false } = {} ) {
			const logStack = Object.entries( stack )

			if ( ! logStack.length ) {
				return
			}

			if ( stats.errors ) {
				log()
				log( chalk.yellow( 'Problems occurred during processing of one or more files, blocks or block variants (permutations)\n\nBlock output may be incomplete or contain invalid syntax!' ) )
			}
			else if ( stats.warnings ) {
				log( chalk.yellow( 'Warnings were generated.' ) )
			}

			log()
			this.printLogItems( logStack, verbose )
		},

		printLogItems( logItems = undefined, verbose = false ) {
			const logStack = logItems ?? Object.entries( stack )

			if ( ! logStack.length ) {
				return
			}

			let currentSection
			logStack.forEach( ( [ store, items ] ) => {
				if ( ! items.length ) {
					return
				}

				if ( store !== currentSection ) {
					log()
					if ( store !== 'default' ) {
						log( chalk.blueBright( `[${ store }]` ) )
					}
					currentSection = store
				}

				items.forEach( ( item ) => {
					const parts = item.format( verbose )
					parts.forEach( ( i ) => log( i ) )
				} )
			} )
		},

		setSection( store = '' ) {
			current.store = store
		},

		setLabel( label = '' ) {
			current.label = label
		},

		setContext( context = undefined ) {
			current.context = context
		},
	}

	return logHandler

	function LogMsg() {
		/** @type {LogItem} */
		let _logItem

		/**
		* @param {keyof typeof logLevels} level
		* @param {string} message
		* @param {*} additionalData
		* @param {Error} errorObj
		*/
		function create( level, message, additionalData, errorObj = undefined ) {
			const resolvedAdditionalData = additionalData === undefined ? undefined : ( Object( additionalData ) === additionalData ? _.cloneDeep( additionalData ) : additionalData )

			const levelInt = logLevels[ level ]
			const stacktrace = getStackTrace( errorObj )
			const { file, line, column } = getLocation( stacktrace )

			_logItem = {
				level: levelInt,
				levelStr: level,
				context: current.context,
				label: current.label,
				msg: message,
				additionalData: resolvedAdditionalData,
				file,
				line,
				column,
				stacktrace: stacktrace.join( NL ),
			}

			return _logItem
		}

		/**
		 * @param {boolean} verbose
		 */
		function format( verbose ) {
			const { additionalData, column, context, file, label, levelStr, line, msg, stacktrace } = _logItem
			const _label = label && context === logHandler.BLOCK_BUILDER ? chalk.yellowBright( `[${ label }]\n` ) : ''
			const location = chalk.cyanBright( `@${ file }:${ line }:${ column }` )
			const item = [ `${ _label }${ logLevelLabels[ levelStr ] }  >>>  ${ msg }\n${ location }` ]

			if ( additionalData !== undefined ) {
				const additionalDataString = JSON.stringify( additionalData, jsonReplaceUndefined, 4 )

				// !Bug: without an empty array item, the arrow below is not displayed!
				item.push( '' )
				item.push( chalk.dim( additionalDataString ), '' )
			}

			if ( verbose ) {
				item.push( `${ chalk.yellow( '◆ ◆ ◆  Stack Trace  ◆ ◆ ◆' ) }` )
				item.push( chalk.dim( stacktrace ) )
			}

			item.push( NL )

			return item
		}

		function getStackTrace( errorObj = undefined ) {
			const _errorObj = errorObj ?? new Error()
			const errorMsg = `Error: ${ _errorObj.message }`
			let stacktrace = _errorObj.stack
			stacktrace = stacktrace.replace( new RegExp( errorMsg, 'g' ), '' )

			// Split by line, discard 5 first lines
			const lines = stacktrace.split( NL )
			return errorObj ? lines.slice( 1 ) : lines.slice( 5 )
		}

		/**
		 * @param {string[]} stacktrace
		 */
		function getLocation( stacktrace ) {
			// Grab first line, were logger was called)
			const string = stacktrace[ 0 ]

			// Parse string to get file and line
			const rx = /(file:\/\/\/(?<file>.*):(?<line>[\d]+):(?<column>[\d]+))/i
			const info = string.match( rx )

			if ( ! info || ! info.groups ) {
				return { file: 'n/a' }
			}

			const { file, line, column } = info.groups

			// Show path relative to cwd
			const cwd = process.cwd()
			const __file = path.relative( cwd, file )
			return { file: __file, line, column }
		}

		return {
			create,
			get data() {
				return _logItem
			},
			format,
		}
	}
}

function jsonReplaceUndefined( __, value ) {
	return typeof value === 'undefined' ? '<undefined>' : value
}

import chalk from 'chalk'
import _ from 'lodash'
import { log } from '../lib/utils.js'

/**
 * Logging factory.
 */
export default function GeneratorLog() {
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

	/**
	 * @type {{[store: string]: LogItem[]}}
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
		error( message, ...errorData ) {
			stats.errors++
			return NewLogItem( 'error', message, errorData )
		},
		warn( message, ...errorData ) {
			stats.warnings++
			return NewLogItem( 'warn', message, errorData )
		},
		notice( message, ...errorData ) {
			stats.notices++
			return NewLogItem( 'notice', message, errorData )
		},
		printLog( threshold = 3 ) {
			const logArr = Object.entries( stack )

			if ( ! logArr.length ) {
				return
			}

			if ( stats.errors ) {
				log()
				// log( chalk.bold( chalk.bgRedBright( ' WARNING ' ) + chalk.bgWhite( ' Errors occurred during processing! ' ) ) )
				// log()
				log( chalk.yellow( 'Problems occurred during processing of one or more files, blocks or block variants (permutations)\n\nBlock output may contain invalid syntax or be incomplete!' ) )
			}
			else if ( stats.warnings ) {
				log( chalk.yellow( 'Warnings were generated.' ) )
			}

			log()

			let currentSection
			logArr.forEach( ( [ store, items ] ) => {
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
					log( ...formatLogItem( item ) )
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

	/**
	 *
	 * @param {keyof typeof logLevels} level
	 * @param {string} msg
	 * @param {*} additionalData
	 */
	function NewLogItem( level, msg, additionalData ) {
		let resolvedAdditionalData = additionalData && additionalData.length === 1 ? additionalData[ 0 ] : additionalData
		resolvedAdditionalData = resolvedAdditionalData !== undefined && ( Object( resolvedAdditionalData ) === resolvedAdditionalData ? _.cloneDeep( resolvedAdditionalData ) : resolvedAdditionalData )

		const levelInt = logLevels[ level ]
		const { file, line, column } = getLocation()

		/** @type {LogItem} */
		const logItem = {
			level: levelInt,
			levelStr: level,
			context: current.context,
			label: current.label,
			msg,
			additionalData: resolvedAdditionalData,
			file,
			line,
			column,
		}

		const store = current.store || 'default'
		stack[ store ] = stack[ store ] ?? []
		stack[ store ].push( logItem )
		return logItem
	}

	/**
	 * @param {LogItem} stackItem
	 */
	function formatLogItem( stackItem ) {
		const logLevelLabels = {
			error: chalk.redBright.bold( 'ERROR' ),
			warn: chalk.yellowBright.bold( 'WARNING' ),
			notice: chalk.cyan.bold( 'NOTICE' ),
		}

		const { additionalData, column, context, file, label, levelStr, line, msg } = stackItem
		const _label = label && context === logHandler.BLOCK_BUILDER ? chalk.yellowBright( `${ label }\n` ) : ''

		// const item = [ `${ label }${ logLevelLabels[ stackItem.levelStr ] } @{}> ${ stackItem.msg }` ]
		const location = chalk.cyanBright( `@${ file }:${ line }:${ column }` )
		const item = [ `${ _label }${ logLevelLabels[ levelStr ] }  >>>  ${ msg }\n${ location }` ]

		if ( additionalData ) {
			// ▣▶◆◇↪
			item.push( '\n↪ ' )
			item.push( additionalData )
		}

		item.push( '\n' )

		return item
	}

	function getLocation() {
		const stacktrace = new Error().stack

		// Split by line, then grab line 5 (line were logger was called)
		const string = stacktrace.split( '\n' )[ 4 ]

		// Parse string to get file and line
		const rx = /(file:\/\/\/(?<file>.*):(?<line>[\d]+):(?<column>[\d]+))/i
		const info = string.match( rx )
		const { file, line, column } = info.groups

		// Show path relative to cwd
		const cwd = process.cwd()
		const __file = path.relative( cwd, file )
		return { file: __file, line, column }
	}
}

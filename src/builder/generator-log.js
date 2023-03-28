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
	 * @typedef {{
	 * 		level: number,
	 * 		levelStr: string,
	 * 		context: string,
	 * 		label: string,
	 * 		msg: string,
	 * 		errorData: string
	 * }} ErrorItem
	 *
	 * @type {{[store: string]: ErrorItem[]}}
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
	 * @param {*} errorData
	 */
	function NewLogItem( level, msg, errorData ) {
		let finalErrorData = errorData && errorData.length === 1 ? errorData[ 0 ] : errorData
		finalErrorData = finalErrorData !== undefined && ( Object( finalErrorData ) === finalErrorData ? _.cloneDeep( finalErrorData ) : finalErrorData )

		const levelInt = logLevels[ level ]

		/** @type {ErrorItem} */
		const logItem = {
			level: levelInt,
			levelStr: level,
			context: current.context,
			label: current.label,
			msg,
			errorData: finalErrorData,
		}

		const store = current.store || 'default'
		stack[ store ] = stack[ store ] ?? []
		stack[ store ].push( logItem )
		return logItem
	}

	function formatLogItem( stackItem ) {
		const logLevelLabels = {
			error: chalk.redBright.bold( 'ERROR' ),
			warn: chalk.yellowBright.bold( 'WARNING' ),
			notice: chalk.cyan.bold( 'NOTICE' ),
		}

		const label = stackItem.label && stackItem.context === logHandler.BLOCK_BUILDER ? `[${ stackItem.label }]\n` : ''

		const item = [ `${ label }${ logLevelLabels[ stackItem.levelStr ] } > ${ stackItem.msg }` ]

		if ( stackItem.errorData ) {
			// _item.push( `Additional error data:` )▣▶◆◇
			item.push( '\n↪ ' )
			item.push( stackItem.errorData )
		}

		item.push( '\n' )

		return item
	}
}

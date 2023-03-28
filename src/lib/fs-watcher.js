/**
 * Filesystem Watcher & Sync
 *
 * @version 1.2
 */

'use strict'

import fs from 'fs'
import nodePath from 'path'
import chokidar from 'chokidar'
import chalk from 'chalk'

import { copyFileAsync, eraseDirContentsAsync, pathExists, readDirAsync } from './fs-utils.js'
import AsyncQueue from './async-queue.js'

const log = console.log.bind( console )

const configDefaults = {
	dryRun: false,
	runOnce: false,
	quiet: false,
	resetTarget: true,
	copyFiles: true,
	deleteFiles: true,
	// removeRemoteOrphans: true,

	icons: {
		unlink: '💥',
		unlinkDir: '💥',
		add: '📄',
		addDir: '📁',
		change: '🔄',
		toRemote: ' ⇛  ', // ⨽⨠◣⇛⇨⇒⇾▶◁▷⇉→↣⇏⇒►►►
	},

	// _logMsg: `${ chalk.green( '[%name%]' ) } >> `,
	// Available tokens: name, icon, event, file, source, target, sourcePath, targetPath
	// logMsg: '%icon% %file%',

	logMsg: `%name% %icon%   %file%`,
	sourceToRemoteMsg: `%name%  %icon%  %file%`,
	remoteCleanupMsg: `%name%  %icon%  %file%`,
	waitMsg: `${ chalk.redBright( '\n⏳ Watching...' ) }(press CTRL+C to quit)\n`,
	errorMsg: ` ↪   ❌ ${ chalk.magentaBright( '%message%' ) }`,
	waitMsgDelay: 2000,
}

/**
* Create file watcher and sync utility.
*
* Uses chokidar under the hood.
*
* LOCATION SETUP
*
* locations: [ {
* 		label: '',
* 		source: '',
* 		target: '',
* } ]
*
* @param {Object} props
*/
export async function fsWatcher( { locations, config = {}, fileEventHandlers = {}, ignoreFiles = [], chokidarConfig = {} } ) {
	let initialSync = true

	const _config = { ...configDefaults, ...config }
	const { quiet, resetTarget } = _config
	const paths = locations.map( ( item ) => item.source )
	const syncStats = {
		total: 0,
		skipped: 0,
		synced: 0,
	}

	// Reset remote dir before starting?
	if ( _config.resetTarget ) {
		for ( const item of locations ) {
			const res = await eraseDirContentsAsync( item.target, { restrictPathsToCwd: false, throwErrors: false, attempts: 5 } )

			if ( res !== true ) {
				log( '\n', res )
				log( '\n*** SYNC ABORTED! ***\n' )
				return false
			}
		}
	}

	const _chokidarConfig = 	{
		ignored: ignoreFiles, // ignore dotfiles
		persistent: true,
		...chokidarConfig,
	}

	_chokidarConfig.ignored.push( /(^|[/\\])\../ )

	const eventHandlers = {
		async add( remotePath, localPath ) {
			const result = await copyFileAsync( localPath, remotePath, true )
			return result
		},
		addDir( remotePath ) {
			if ( ! fs.existsSync( remotePath ) ) {
				fs.mkdirSync( remotePath )
			}
		},
		change( remotePath, localPath ) {
			return this.add( remotePath, localPath )
		},
		unlink( remotePath ) {
			if ( fs.existsSync( remotePath ) ) {
				fs.unlinkSync( remotePath )
			}
		},
		unlinkDir( remotePath ) {
			// must remove directories recursively, may not be empty
			if ( fs.existsSync( remotePath ) ) {
				fs.rmSync( remotePath, {
					recursive: true,
					force: true,
					maxRetries: 10,
				} )
			}
			// fs.rmdirSync( remotePath )
		},
		...fileEventHandlers,
	}

	const waitHandler = ! _config.runOnce && (
		() => _config.quiet !== true && log( _config.waitMsg )
	)

	function errorHandler( message ) {
		log( replaceTemplateStrings( _config.errorMsg, { message } ) )
	}

	async function watchHandler( event, sourcePath, stat ) {
		const location = locations.find( ( l ) => stringStartsWith( sourcePath, l.source ) )

		let file = nodePath.relative( location.source, sourcePath )
		file = file || '.'

		const targetPath = nodePath.join( location.target, file )
		const defaultReturn = { [ sourcePath ]: true }

		// todo: if ( _config.removeRemoteOrphans ) {}

		syncStats.total++

		// Sync modes
		// if ( ! _config.copyFiles && file !== '.' ) {
		// 	if ( event === 'add' || event === 'addDir' ) {
		// 		return defaultReturn
		// 	}
		// }
		// if ( ! _config.deleteFiles && file !== '.' ) {
		// 	if ( event === 'unlink' || event === 'unlinkDir' ) {
		// 		return defaultReturn
		// 	}
		// }

		// If initial sync, discover if files have changed
		if ( initialSync ) {
			const isNewDir = event === 'addDir'

			if ( ! resetTarget && pathExists( targetPath ) ) {
				if ( stat.isDirectory() ) {
					syncStats.skipped++
					return defaultReturn
				}

				// If not changed, skip
				const targetStat = fs.statSync( targetPath )
				if ( stat.mtime.toString() === targetStat.mtime.toString() ) {
					syncStats.skipped++
					return defaultReturn
				}

				event = 'change'
			}

			// If directory, check for missing items
			if ( isNewDir ) {

			}
		}

		syncStats.synced++

		if ( quiet !== true ) {
			log( replaceTemplateStrings( _config.sourceToRemoteMsg, {
				name: '',
				event,
				file,
				sourcePath,
				targetPath,
				icon: _config.icons[ event ],
				toRemote: _config.icons.toRemote,
				...location, // = source,target,name
			} ) )
		}

		const result = await eventHandlers[ event ]( targetPath, sourcePath )
		return { [ sourcePath ]: result === undefined }
	}

	const { asyncHandler, queueComplete } = AsyncQueue( watchHandler, errorHandler, waitHandler, _config.waitMsgDelay )

	const watcher = chokidar.watch( paths, _chokidarConfig )

	const [ isWatchComplete, endWatch ] = asyncResolver()

	watcher
		.on( 'all', asyncHandler )
		.on( 'ready', () => {
			if ( _config.runOnce ) {
				const conditions = [ queueComplete(), watcher.close() ]
				return Promise.allSettled( conditions )
					.then( ( c ) => {
						endWatch( syncStats )
					} )
			}

			initialSync = false
		} )
		.on( 'error', ( error ) => {
			log( `Watcher error: ${ error }` )
			endWatch()
		} )

	return await isWatchComplete
}

/**
 * @return {[Promise<any>, (resolveValue: any) => void]}
 */
function asyncResolver() {
	const resolver = {
		isResolved: undefined,
		resolve: undefined,
	}

	resolver.isResolved = new Promise( ( resolve ) => resolver.resolve = resolve )

	return [
		resolver.isResolved,
		resolver.resolve,
	]
}

function stringStartsWith( string, compare ) {
	return string.slice( 0, compare.length ) === compare
}

function replaceTemplateStrings( string, values, bracket = '%' ) {
	const rx = new RegExp( `${ bracket }([\\w\\-_]*)${ bracket }`, 'gi' )
	return string.replace( rx, ( expr, key ) => {
		return values[ key ]
	} )
}

/**
 * File Sync watcher
 * v1.0
 */

'use strict'

import fs from 'fs'
import nodePath from 'path'
import chokidar from 'chokidar'
import chalk from 'chalk'

import { replaceTemplates, stringStartsWith } from './utils.js'
import { copyFileAsync } from './fs-utils.js'
import { AsyncQueue } from './async-queue.js'

const log = console.log.bind( console )

const configDefaults = {
	dryRun: false,
	runOnce: false,
	icons: {
		unlink: '💥',
		unlinkDir: '💥',
		add: '📄',
		addDir: '📁',
		change: '🔄',
		toRemote: ' ⇛  ', // ⨽⨠◣⇛⇨⇒⇾▶◁▷⇉→↣⇏⇒►►►
	},

	// _logMsg: `${ chalk.green( '[%name%]' ) } >> `,
	// Available tokens: name, icon, event, file, source, destination, sourcePath, destinationPath
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
 * 		destination: '',
 * } ]
 *
 * @param {Object} props
 */
export function fileSyncWatcher( { locations, config = {}, fileEventHandlers = {}, ignoreFiles = [], chokidarConfig = {} } ) {
	let ready = false

	const _config = { ...configDefaults, ...config }
	const paths = locations.map( ( item ) => item.source )

	const _chokidarConfig = {
		ignored: ignoreFiles, // ignore dotfiles
		persistent: true,
		// alwaysStat: true,
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

	const { waitMsg, waitMsgDelay, errorMsg, sourceToRemoteMsg, icons, runOnce } = _config
	const waitHandler = () => log( waitMsg )

	function errorHandler( message ) {
		log( replaceTemplates( errorMsg, { message } ) )
	}

	async function watchHandler( event, sourcePath, stats ) {
		const location = locations.find( ( l ) => stringStartsWith( sourcePath, l.source ) )

		let file = nodePath.relative( location.source, sourcePath )
		file = file || '.'
		const destinationPath = nodePath.join( location.destination, file )

		if ( file === '.' ) {
			// log( 'jello' )
		}

		log( replaceTemplates( sourceToRemoteMsg, {
			...location, // = source,destination,name
			event,
			file,
			sourcePath,
			destinationPath,
			icon: icons[ event ],
			toRemote: icons.toRemote,
		} ) )

		const result = await eventHandlers[ event ]( destinationPath, sourcePath )
		return { [ sourcePath ]: result === undefined }
	}

	const queueWatcher = AsyncQueue( watchHandler, errorHandler, waitHandler, waitMsgDelay )

	const watcher = chokidar.watch( paths, _chokidarConfig )

	watcher
		.on( 'all', queueWatcher )
		.on( 'ready', () => {
			ready = true

			if ( runOnce ) {
				watcher.close()
			}
		} )
		.on( 'error', ( error ) => log( `Watcher error: ${ error }` ) )
}

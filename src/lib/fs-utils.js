'use strict'

import fs, { promises as fsAsync } from 'fs'
import glob from 'glob'
import nodePath from 'path'

const log = console.log.bind( console )

async function delay( ms ) {
	return new Promise( ( r ) => setTimeout( r, ms ) )
}

async function timeOut( fn, attempts, interval = [ 100, 100, 100, 100, 100, 200, 300, 500, 1000, 2000, 5000 ] ) {
	let i = 0
	while ( ++i ) {
		try {
			const res = await fn( i )

			if ( res === true ) {
				return true
			}

			if ( i === attempts ) {
				return res
			}
		}
		catch ( e ) {
			return e
		}

		await delay( interval[ i ] )
	}
}

export function niceRelPath( path, ignore ) {
	return nodePath.join( '...', nodePath.relative( ignore, path ) )
}

/**
 * Read text contents of file (synchronous).
 *
 * @param {string} filename
 * @param {'error'|'warn'|'skip'|'throw'} [onError='error'] Error, warning, skip silently or throw exception (default)
 * @return {string} File contents
 */
export function readFile( filename, onError = 'skip' ) {
	let file
	try {
		file = fs.readFileSync( filename, 'utf8' )
	}
	catch ( err ) {
		switch ( onError ) {
			case 'error': console.error( err ); return false
			case 'warn': console.warn( err ); return false
			case 'skip': return false
		}

		throw err
	}
	return file
}

/**
 * Append to text file (async), but do not block program.
 *
 * @param {string} filePath
 * @param {string} fileName
 * @param {string} contents
 * @return {Promise<void | Error>}
 */
export async function saveFileAsync( filePath, fileName = undefined, contents ) {
	let file
	if ( fileName ) {
		file = nodePath.join( filePath, fileName )
	}
	else {
		file = filePath
		filePath = nodePath.dirname( file )
	}

	await fsAsync.mkdir( filePath, { recursive: true } )

	// write file asynchronously, but do not block
	fs.writeFile( file, contents, function( err ) {
		if ( err ) {
			throw new Error( err.message )
		}
	} )
}

/**
 * Copy file (async).
 *
 * @param {string} source
 * @param {string} destination
 * @param {boolean} overwrite
 * @return {Promise<string|undefined>} Returns undefined on success, error message on failure.
 */
export async function copyFileAsync( source, destination, overwrite = false ) {
	const mode = overwrite ? 0 : fs.constants.COPYFILE_EXCL

	try {
		await fsAsync.copyFile( source, destination, mode )
	}
	catch ( error ) {
		if ( error.errno === -4058 ) {
			return `Copy failed, source file does not exist ('${ source }').`
		}
		else if ( error.errno === -4075 ) {
			return `Copy failed, destination file already exists ('${ source }').`
		}
		return error.message
	}
}

export async function mergeTextFiles( { sources, target = undefined, overwriteTarget = false, addNewLine = true } ) {
	const left = target ?? sources.shift()
	const right = sources.shift()

	if ( overwriteTarget ) {
		saveFileAsync( left, null, '' )
	}

	let data = readFile( right, 'skip' )

	if ( data ) {
		data = ( ! overwriteTarget && addNewLine ? '\n' : '' ) + data
		await fsAsync.mkdir( nodePath.dirname( left ), { recursive: true } )
		fs.appendFileSync( left, data )
	}

	if ( sources.length ) {
		mergeTextFiles( { target: left, sources } )
	}
}

/**
 * Synchronously check if a file or folder exists.
 *
 * @param {string} path
 */
export function pathExists( path ) {
	return fs.existsSync( path )
}

/**
 * Get files and folders from given path.
 *
 * @param {string} directoryPath
 * @param {boolean} [recursive=false] [false] Read files and folders recursively
 * @param {string} [filter=''] Glob pattern
 * @return Promise containing array of files.
 */
export async function readDirAsync( directoryPath, recursive = false, filter = '' ) {
	// const options = {
	// 	cwd: directoryPath
	// }
	const _path = nodePath.resolve( directoryPath )
	const pattern = nodePath.join( _path, filter || ( recursive ? '/**/*' : '/*' ) )

	const unixPattern = pattern && pattern.replace( /\\/g, '//' ) // Glob can't handle windows backslash!

	const results = await new Promise( ( resolve ) => glob( unixPattern, ( err, files ) => {
		if ( err ) {
			console.error( err )
			resolve()
		}
		const _files = files.map( ( x ) => nodePath.resolve( x ) )
		resolve( _files )
	} ) )
	return results
}

/**
 * Check if one directory is inside another.
 *
 * @param {string} child
 * @param {string} parent
 */
export function isChildOfDirectory( child, parent ) {
	const relative = nodePath.relative( parent, child )
	return !! relative && ! relative.startsWith( '..' ) && ! nodePath.isAbsolute( relative )
}

/**
 * Check if a directory is inside the current working directory.
 * Only work on paths inside process.cwd()
 *
 * @param {string} directoryPath
 */
export function isInsideCwd( directoryPath ) {
	return isChildOfDirectory( directoryPath, process.cwd() )
}

/**
 * Check if path is or is inside a forbidden directory.
 *
 * Illegal directories: node_modules|scripts|src|assets|examples
 *
 * !! INCOMPLETE !!
 *
 * @param {string} directoryPath
 * @param {string[]} illegalDirectories Custom list of directories to eschew
 */
export function isPathPermitted( directoryPath, illegalDirectories = undefined ) {
	const defaultIllegalPaths = /^(node_modules|scripts|src|assets|examples)/i
	// const rx = illegalDirectories || defaultIllegalPaths
	return ! defaultIllegalPaths.test( nodePath.relative( process.cwd(), directoryPath ) )
}

/**
 * Delete all files and folders at a given path.
 *
 * Todo: Fix rmdir -4048 error (EPERM: operation not permitted). Means files are locked.
 *
 * @param {string} directoryPath
 */
export async function eraseDirContentsAsync( directoryPath, { attempts = 5, restrictPaths = true, restrictPathsToCwd = true, verboseErrors = true, throwErrors = true } = {} ) {
	if ( restrictPathsToCwd && ! isInsideCwd( directoryPath ) ) {
		throw new Error( `Cannot use directory '${ directoryPath }': must be a descendant of the current working directory.` )
	}

	if ( restrictPaths && ! isPathPermitted( directoryPath ) ) {
		throw new Error( `Cannot use directory '${ directoryPath }': illegal path.` )
	}

	const files = await readDirAsync( directoryPath, true )

	// Delete folder contents recursively
	const resultsPromises = files.reverse().map( async( file ) => {
		const res = await timeOut( async( attempt ) => {
			try {
				await fsAsync.rm( file, { recursive: true } )
				return true
			}
			catch ( error ) {
				// File not found (already deleted)
				log( 'error.code ', error.code )

				if ( error.code === 'ENOENT' ) {
					return true
				}

				if ( verboseErrors && attempt < attempts ) {
					log( '\nUnabled to delete file: ', file )
					log( `\nTrying again, attempt (${ attempt })...` )
				}

				// log( error )

				return verboseErrors ? error : false

				// EPERM: operation not permitted (probably because  of file lock or permission error)
				// Error occurs even when files are successfully deleted
				// Treat as harmless in this context?
				if ( error.errno === -4048 ) {
					console.warn( `\nA possible error occurred while deleting files in '${ directoryPath }'.\nError: [EPERM: operation not permitted (-4048)].\n\nIf no other errors are reported, this is probably harmless.` )
					// throw ( error )
				}
				else {
					throw ( error )
				}
			}
		}, attempts )

		if ( res !== true ) {
			log( `\nFailed to delete file: ${ file }.\n` )
			log( res )
			log()
		}

		return res
	} )

	const results = await Promise.all( resultsPromises )
	const success = results.every( ( value ) => value === true )

	// Check if successful
	if ( ! success ) {
		const residual = await readDirAsync( directoryPath, true )
		if ( ! residual.length ) {
			return true
		}

		const e = new Error( `Could not delete all files in '${ directoryPath }'.` )

		if ( throwErrors ) {
			throw e
		}
		return e
	}

	return true
}

export async function syncFilesRecursive( source, target, options = { forceOverwrite: true, removeOrphaned: false }, fileQueue = undefined ) {
	const { forceOverwrite, removeOrphaned } = options
	const isRoot = !! fileQueue
	fileQueue = fileQueue ?? []

	const sourceFiles = await readDirAsync( source, true )
	const targetFiles = await readDirAsync( target, true )

	const copiedFiles = await sourceFiles.map( async( file ) => {
		const fsItem = await fsAsync.lstat( file )
		const relPath = nodePath.relative( source, file )
		const targetItem = nodePath.resolve( target, relPath )
		const existsInTarget = fs.existsSync( targetItem )

		if ( fsItem.isDirectory() ) {
			if ( ! existsInTarget ) {
				fs.mkdirSync( targetItem, { recursive: true } )
				log( `[D] ${ file }` )
				await syncFilesRecursive( file, targetItem, options, fileQueue )
			}
		}
		else {
			// if ( existsInTarget ) {
			return copyFileAsync( file, targetItem )
			// }
		}
	} )

	const removedFiles = ! removeOrphaned ? [] : await targetFiles.map( async( file ) => {
		const fsItem = await fsAsync.lstat( file )
		const relPath = nodePath.relative( source, file )
		const sourceItem = nodePath.resolve( target, relPath )

		log( file )

		if ( ! fs.existsSync( sourceItem ) ) {
			log( file )

			return fsAsync.rm( file, { recursive: true } )
		}
	} )

	fileQueue.push( ...copiedFiles, ...removedFiles )

	return isRoot ? Promise.all( fileQueue ) : fileQueue
	// return fileQueue.concat( fQueue )
}

export function rmDirRecursiveSync( path ) {
	if ( fs.existsSync( path ) ) {
		fs.rmSync( path, {
			recursive: true,
			force: true,
			maxRetries: 10,
		} )
	}
}

// exports.readFile = readFile
// exports.copyFileAsync = copyFileAsync
// exports.parseJson = parseJson
// exports.loadJsonFiles = loadJsonFiles
// exports.saveFileAsync = saveFileAsync
// exports.readDirAsync = readDirAsync
// exports.eraseDirContentsAsync = eraseDirContentsAsync
// exports.pathExists = pathExists

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

export { arrayDeduplicate, extractArrayElements, log, removeArrayElements, removeObjectKeys }

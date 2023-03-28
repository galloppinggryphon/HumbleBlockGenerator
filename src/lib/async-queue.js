'use strict'

/**
 * Async promise queue manager.
 *
 * @version 1.2
 *
 * @param {function} watchHandler
 * @param {function} errorHandler
 * @param {function} waitHandler
 * @param {number} waitDelay
 */
export default function AsyncQueue( watchHandler, errorHandler, waitHandler, waitDelay = 2000 ) {
	let queue = []
	let pendingPromise = false
	let stopped = false
	let waitTimer

	function startTimeoutTimer() {
		clearTimeout( waitTimer )

		if ( waitHandler ) {
			waitTimer = setTimeout( () => {
				if ( ! queue.length ) {
					waitHandler()
				}
			}, waitDelay )
		}
	}

	async function dequeue() {
		if ( pendingPromise ) {
			return false
		}

		if ( stopped ) {
			queue = []
			stopped = false
			return
		}

		const item = queue.shift()

		if ( ! item ) {
			return false
		}
		try {
			pendingPromise = true

			const value = await item.promise()
				.then( ( v ) => v )
				.catch( ( err ) => new Error( err ) )

			if ( value instanceof Error ) {
				// item.reject()
				errorHandler( value.message )
			}
			else {
				item.resolve( value )
			}

			startTimeoutTimer()

			pendingPromise = false

			dequeue()
		}
		catch ( err ) {
			pendingPromise = false
			item.reject( err )
			dequeue()
		}
		return true
	}

	return {
		asyncHandler( ...args ) {
			return new Promise( ( resolve, reject ) => {
				queue.push( {
					promise: () => watchHandler( ...args ),
					resolve,
					reject,
				} )
				dequeue()
			} )
		},
		async queueComplete( callback = undefined ) {
			while ( true ) {
				const queueResolved = await Promise.allSettled( queue )

				await delay( waitDelay )

				if ( typeof callback === 'function' ) {
					return queueResolved.then( () => {
						callback()
					} )
				}
				return queueResolved
			}
		},
	}
}

async function delay( ms ) {
	return new Promise( ( r ) => setTimeout( r, ms ) )
}

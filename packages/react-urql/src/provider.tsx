import { createClient as createWSClient } from 'graphql-ws'
import React, { PropsWithChildren } from 'react'
import {
  cacheExchange,
  createClient as createUrqlClient,
  dedupExchange,
  Exchange,
  fetchExchange,
  Provider as UrqlProvider,
  RequestPolicy,
  subscriptionExchange
} from 'urql'

import type { NhostClient } from '@nhost/nhost-js'
import { refocusExchange } from '@urql/exchange-refocus'

export type NhostUrqlClientOptions = {
  nhost?: NhostClient
  graphqlUrl?: string
  headers?: {
    [header: string]: string
  }
  requestPolicy?: RequestPolicy
  exchanges?: Exchange[]
}

// TODO: Break out this function to a separate package: @nhost/urql
function createNhostUrqlClient(options: NhostUrqlClientOptions) {
  const { nhost, headers, requestPolicy = 'cache-and-network' } = options

  console.log('create nhost urql client')

  if (!nhost) {
    throw Error('no `nhost` instance provided.')
  }

  const getHeaders = () => {
    // add headers
    const resHeaders = {
      ...headers,
      'Sec-WebSocket-Protocol': 'graphql-ws'
    } as { [header: string]: string }

    const accessToken = nhost.auth.getAccessToken()

    if (accessToken) {
      resHeaders.authorization = `Bearer ${accessToken}`
    }

    return resHeaders
  }

  let exchanges: Exchange[] | undefined = [
    dedupExchange,
    refocusExchange(),
    cacheExchange,
    fetchExchange
  ]

  if (typeof window !== 'undefined') {
    const wsUrl = nhost.graphql.getUrl().replace('http', 'ws')

    // Close the active socket when token changes.
    // The WEbSocket client will automatically reconnect with the new token.
    let activeSocket: any
    console.log('setting up token change function')
    nhost.auth.onTokenChanged(() => {
      console.log('custom function: token changed!')
      activeSocket.close()
    })

    const wsClient = createWSClient({
      url: wsUrl,
      connectionParams() {
        return {
          headers: {
            ...getHeaders()
          }
        }
      },
      on: {
        connected: (socket: any) => {
          activeSocket = socket
        }
      }
    })

    const subExchange = subscriptionExchange({
      forwardSubscription: (operation) => ({
        subscribe: (sink) => ({
          unsubscribe: wsClient.subscribe(operation, sink)
        })
      })
    })

    exchanges.push(subExchange)
  }

  const client = createUrqlClient({
    url: nhost.graphql.getUrl(),
    requestPolicy,
    exchanges,
    fetchOptions: () => {
      return {
        headers: {
          ...getHeaders()
        }
      }
    }
  })

  return client
}

export const NhostUrqlProvider: React.FC<PropsWithChildren<NhostUrqlClientOptions>> = ({
  children,
  ...options
}) => {
  const client = createNhostUrqlClient(options)

  return <UrqlProvider value={client}>{children}</UrqlProvider>
}
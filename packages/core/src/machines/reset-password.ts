import { assign, createMachine, send } from 'xstate'

import { AuthClient } from '../client'
import { ErrorPayload, INVALID_EMAIL_ERROR } from '../errors'
import { nhostApiClient } from '../hasura-auth'
import { ResetPasswordOptions, ResetPasswordResponse } from '../types'
import { rewriteRedirectTo } from '../utils'
import { isValidEmail } from '../validators'

export type ResetPasswordContext = {
  error: ErrorPayload | null
}
export type ResetPasswordEvents =
  | {
      type: 'REQUEST'
      email?: string
      options?: ResetPasswordOptions
    }
  | { type: 'SUCCESS' }
  | { type: 'ERROR'; error: ErrorPayload | null }

export type ResetPasswordServices = {
  requestChange: { data: ResetPasswordResponse }
}

export type ResetPasswordMachine = ReturnType<typeof createResetPasswordMachine>

export const createResetPasswordMachine = ({ backendUrl, clientUrl }: AuthClient) => {
  const api = nhostApiClient(backendUrl)
  return createMachine(
    {
      schema: {
        context: {} as ResetPasswordContext,
        events: {} as ResetPasswordEvents,
        services: {} as ResetPasswordServices
      },
      tsTypes: {} as import('./reset-password.typegen').Typegen0,
      predictableActionArguments: true,
      id: 'changePassword',
      initial: 'idle',
      context: { error: null },
      states: {
        idle: {
          on: {
            REQUEST: [
              {
                cond: 'invalidEmail',
                actions: 'saveInvalidEmailError',
                target: '.error'
              },
              {
                target: 'requesting'
              }
            ]
          },
          initial: 'initial',
          states: {
            initial: {},
            success: {},
            error: {}
          }
        },
        requesting: {
          invoke: {
            src: 'requestChange',
            id: 'requestChange',
            onDone: { target: 'idle.success', actions: 'reportSuccess' },
            onError: { actions: ['saveRequestError', 'reportError'], target: 'idle.error' }
          }
        }
      }
    },
    {
      actions: {
        saveInvalidEmailError: assign({ error: (_) => INVALID_EMAIL_ERROR }),
        saveRequestError: assign({
          // * Untyped action payload. See https://github.com/statelyai/xstate/issues/3037
          error: (_, { data: { error } }: any) => error
        }),
        reportError: send((ctx) => ({ type: 'ERROR', error: ctx.error })),
        reportSuccess: send('SUCCESS')
      },
      guards: {
        invalidEmail: (_, { email }) => !isValidEmail(email)
      },
      services: {
        requestChange: (_, { email, options }) =>
          api.post<string, ResetPasswordResponse>('/user/password/reset', {
            email,
            options: rewriteRedirectTo(clientUrl, options)
          })
      }
    }
  )
}
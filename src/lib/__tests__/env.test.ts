import { describe, expect, it } from 'vitest'

import { isAcceptableProviderBaseUrl, isAcceptableSupabaseUrl } from '../env'

describe('isAcceptableSupabaseUrl', () => {
  it('akzeptiert https', () => {
    expect(isAcceptableSupabaseUrl('https://abc.supabase.co')).toBe(true)
  })

  it('akzeptiert http nur lokal', () => {
    // Der lokale Stack läuft ohne TLS auf der Loopback-Adresse. Dort gibt es
    // kein Netz, auf dem jemand mithören könnte.
    expect(isAcceptableSupabaseUrl('http://127.0.0.1:54421')).toBe(true)
    expect(isAcceptableSupabaseUrl('http://localhost:54421')).toBe(true)
  })

  it('lehnt http auf allem anderen ab', () => {
    // Über diese Adresse gehen Passwörter. Eine Produktionsumgebung
    // versehentlich auf http zu konfigurieren würde niemandem auffallen —
    // die App funktioniert ja.
    expect(isAcceptableSupabaseUrl('http://abc.supabase.co')).toBe(false)
    expect(isAcceptableSupabaseUrl('http://192.168.1.10')).toBe(false)
  })

  it('lehnt andere Schemata und Unsinn ab', () => {
    expect(isAcceptableSupabaseUrl('ftp://abc.supabase.co')).toBe(false)
    expect(isAcceptableSupabaseUrl('javascript:alert(1)')).toBe(false)
    expect(isAcceptableSupabaseUrl('abc.supabase.co')).toBe(false)
    expect(isAcceptableSupabaseUrl('')).toBe(false)
  })
})

describe('isAcceptableProviderBaseUrl', () => {
  it('lässt den lokalen Stub zu', () => {
    expect(isAcceptableProviderBaseUrl('http://127.0.0.1:54430/v1')).toBe(true)
    expect(isAcceptableProviderBaseUrl('http://localhost:54430/v1beta')).toBe(true)
  })

  it('lehnt jede Adresse ab, die den Rechner verlässt', () => {
    // Die SDKs schicken den API-Schlüssel an diese Adresse. Eine Umgebung,
    // in der die Variable auf einen fremden Host zeigt, lieferte ihn dorthin
    // aus, während die Anwendung scheinbar normal weiterläuft.
    expect(isAcceptableProviderBaseUrl('https://boeser-host.test/v1')).toBe(false)
    expect(isAcceptableProviderBaseUrl('http://169.254.169.254/v1')).toBe(false)
    expect(isAcceptableProviderBaseUrl('https://api.mistral.ai/v1')).toBe(false)
  })

  it('lehnt ab, was keine http-Adresse ist', () => {
    expect(isAcceptableProviderBaseUrl('file:///etc/passwd')).toBe(false)
    expect(isAcceptableProviderBaseUrl('nicht-mal-eine-url')).toBe(false)
  })
})

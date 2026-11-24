import { useState, type FormEvent } from 'react'
import { LogIn } from 'lucide-react'
import { Marca } from '../components/Layout'
import { Boton, Campo, Entrada } from '../components/ui'
import { iniciarSesion, useSesion } from '../lib/sesion'

export function Login() {
  const { error } = useSesion()
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!correo || !clave) return
    setEnviando(true)
    await iniciarSesion(correo, clave)
    setEnviando(false)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={enviar} className="anim-escala w-full max-w-[400px] rounded-[24px] bg-elevated p-7 shadow-pop">
        <Marca className="mx-auto h-[26px]" />
        <div className="linea-marca mx-auto mt-4 h-[3px] w-16 rounded-full" aria-hidden />
        <h1 className="mt-4 text-center text-[22px] font-bold tracking-[-0.02em]">Portal de Calidad</h1>
        <p className="mt-1 text-center text-[14px] text-ink-2">Ingresa con tu correo corporativo</p>

        <div className="mt-6 flex flex-col gap-4">
          <Campo etiqueta="Correo" htmlFor="correo">
            <Entrada id="correo" type="email" autoComplete="username" autoFocus value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="nombre@positivosmais.com" />
          </Campo>
          <Campo etiqueta="Contraseña" htmlFor="clave" error={error}>
            <Entrada id="clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
          </Campo>
          <Boton type="submit" variante="primario" tam="lg" className="w-full" disabled={enviando || !correo || !clave} icono={<LogIn className="size-4" />}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </Boton>
        </div>
      </form>
    </div>
  )
}
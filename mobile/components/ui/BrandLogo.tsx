import { Image } from 'react-native'
import logoTransparent from '../../assets/images/logo-transparent.png'

type LogoProps = {
  height?: number
  width?: number
}

/** Shared Illuminate mark used across auth + app chrome. */
export function BrandLogo({ height = 36, width = 140 }: LogoProps) {
  return (
    <Image
      source={logoTransparent}
      accessibilityLabel="Illuminate"
      resizeMode="contain"
      style={{ height, width }}
    />
  )
}

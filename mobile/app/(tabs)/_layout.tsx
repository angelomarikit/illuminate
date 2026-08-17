import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import type { ComponentProps } from 'react'
import { Platform, StyleSheet, Text } from 'react-native'
import { colors, typography } from '@/constants/theme'

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
      {label}
    </Text>
  )
}

type IconName = ComponentProps<typeof Ionicons>['name']

function TabIcon({ name, color }: { name: IconName; color: string }) {
  return <Ionicons name={name} size={22} color={color} />
}

function iconColor(color: string | undefined) {
  return color ?? colors.muted
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: styles.tabBar,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Care',
          tabBarLabel: ({ focused }) => <TabLabel label="Care" focused={focused} />,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'heart' : 'heart-outline'} color={iconColor(String(color))} />
          ),
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarLabel: ({ focused }) => <TabLabel label="Book" focused={focused} />,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'calendar' : 'calendar-outline'}
              color={iconColor(String(color))}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: 'Visits',
          tabBarLabel: ({ focused }) => <TabLabel label="Visits" focused={focused} />,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'list' : 'list-outline'} color={iconColor(String(color))} />
          ),
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: 'Rewards',
          tabBarLabel: ({ focused }) => <TabLabel label="Rewards" focused={focused} />,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'gift' : 'gift-outline'} color={iconColor(String(color))} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: ({ focused }) => <TabLabel label="Profile" focused={focused} />,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} color={iconColor(String(color))} />
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingTop: 8,
  },
  label: {
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    color: colors.muted,
  },
  labelActive: {
    color: colors.gold,
  },
})

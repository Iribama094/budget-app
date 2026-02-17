import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Image, Animated, ScrollView, Easing, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { P, PrimaryButton, SecondaryButton, H1 } from '../components/Common/ui';
import { AppBackground } from '../components/Common/AppBackground';
import { tokens } from '../theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  onDone: () => void;
  onContinueToAuth?: (mode: 'login' | 'register') => void;
};

type Slide = {
  title: string;
  subtitle: string;
  isSurvey?: boolean;
  isAuth?: boolean;
  imageUrls?: string[];
};

export function OnboardingScreen({ onDone, onContinueToAuth }: Props) {
  const { theme } = useTheme();

  const logoScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoScale, {
          toValue: 1.08,
          duration: 900,
          useNativeDriver: true
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true
        })
      ])
    ).start();
  }, [logoScale]);

  const slides = useMemo<Slide[]>(
    () => [
      {
        title: 'Welcome to BudgetFriendly',
        subtitle: 'A simple, smart home for your money – built to help you stay on top of spending, savings and goals.',
        imageUrls: [
          'https://images.unsplash.com/photo-1554224155-3a589c39ab79?auto=format&fit=crop&w=1400&q=80',
          'https://images.unsplash.com/photo-1554224154-22dec7ec8818?auto=format&fit=crop&w=1400&q=80'
        ]
      },
      {
        title: 'Track every naira',
        subtitle: 'Capture income and expenses in seconds so nothing slips through the cracks.',
        imageUrls: [
          'https://images.unsplash.com/photo-1554224154-22dec7ec8818?auto=format&fit=crop&w=1400&q=80',
          'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1400&q=80'
        ]
      },
      {
        title: 'Build flexible budgets',
        subtitle: 'Design budgets around your reality – even if income varies month to month.',
        imageUrls: [
          'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1400&q=80',
          'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1400&q=80'
        ]
      },
      {
        title: 'Reach your goals faster',
        subtitle: 'Turn big goals into clear monthly targets and see how close you are, anytime.',
        imageUrls: [
          'https://images.unsplash.com/photo-1508385082359-f38ae991e8f2?auto=format&fit=crop&w=1400&q=80',
          'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=1400&q=80'
        ]
      },
      {
        title: 'Stay one step ahead',
        subtitle: 'Insights, reminders and gentle nudges keep you in control without feeling overwhelmed.',
        imageUrls: [
          'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1400&q=80',
          'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1400&q=80'
        ]
      },
      {
        title: 'Quick survey',
        subtitle: 'Help us tune BudgetFriendly for you by answering a few lightweight questions. This takes less than 30 seconds.',
        isSurvey: true
      },
      {
        title: 'Get started',
        subtitle: 'Create an account to save your progress, or sign in to continue.',
        isAuth: true,
        imageUrls: [
          'https://images.unsplash.com/photo-1542228262-3d663b30669e?auto=format&fit=crop&w=1400&q=80',
          'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&w=1400&q=80'
        ]
      }
    ],
    []
  );

  const [index, setIndex] = useState(0);
  const [reason, setReason] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [interest, setInterest] = useState<string | null>(null);
  const isLast = index === slides.length - 1;
  const isSurvey = slides[index].isSurvey;
  const isAuth = slides[index].isAuth;
  const [imageAttemptByIndex, setImageAttemptByIndex] = useState<Record<number, number>>({});

  const imageAttempt = imageAttemptByIndex[index] ?? 0;
  const imageUrls = slides[index].imageUrls;
  const usingLocalImage = !imageUrls || imageAttempt >= imageUrls.length;
  const heroImageSource = usingLocalImage
    ? require('../../assets/splash-icon.png')
    : { uri: imageUrls[imageAttempt] };

  // Smooth slide-in animation when index changes
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    slideAnim.setValue(0);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [index, slideAnim]);

  const handleDone = () => {
    // In future we can persist this survey; for now we just continue.
    onDone();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Full-screen hero image (no card) + soft brand gradient overlay */}
      {!isSurvey && slides[index].imageUrls ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <Image
            key={`${index}:${imageAttempt}`}
            source={heroImageSource}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            onError={() =>
              setImageAttemptByIndex((prev) => ({
                ...prev,
                [index]: (prev[index] ?? 0) + 1
              }))
            }
          />

          {/* Soft swoosh/wave overlay that fades upward for readability */}
          <LinearGradient
            colors={
              theme.mode === 'dark'
                ? ['rgba(2,6,23,0.02)', 'rgba(2,6,23,0.55)', 'rgba(2,6,23,0.92)']
                : ['rgba(249,250,251,0.02)', 'rgba(15,118,110,0.68)', 'rgba(2,6,23,0.92)']
            }
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              position: 'absolute',
              left: -80,
              right: -80,
              bottom: -140,
              height: '80%',
              borderTopLeftRadius: 240,
              borderTopRightRadius: 340,
              transform: [{ rotate: '-3deg' }]
            }}
          />
        </View>
      ) : (
        <AppBackground />
      )}
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
        {/* Slide content */}
        <View style={{ flex: 1 }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: isSurvey ? 8 : 24,
              flexGrow: 1,
              justifyContent: isSurvey ? 'center' : 'flex-end'
            }}
          >
            <Animated.View
              style={{
                opacity: slideAnim,
                transform: [
                  {
                    translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] })
                  }
                ]
              }}
            >
              <H1
                style={{
                  marginBottom: 10,
                  textAlign: 'center',
                  alignSelf: 'center',
                  maxWidth: 360,
                  color: !isSurvey ? tokens.colors.white : theme.colors.text
                }}
              >
                {slides[index].title}
              </H1>
              <P
                style={{
                  marginTop: 6,
                  fontSize: 16,
                  lineHeight: 24,
                  textAlign: 'center',
                  alignSelf: 'center',
                  maxWidth: 360,
                  color: !isSurvey ? 'rgba(249,250,251,0.9)' : theme.colors.text
                }}
              >
                {slides[index].subtitle}
              </P>

              {isAuth ? (
                <View style={{ marginTop: 18, width: '100%', alignSelf: 'center', maxWidth: 420 }}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <SecondaryButton
                        title="Create Account"
                        onPress={() => {
                          if (onContinueToAuth) onContinueToAuth('register');
                          else onDone();
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton
                        title="Sign In"
                        onPress={() => {
                          if (onContinueToAuth) onContinueToAuth('login');
                          else onDone();
                        }}
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              {slides[index].isSurvey && (
                <View style={{ marginTop: 20, marginBottom: 4 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '800', marginBottom: 8, fontSize: 15, textAlign: 'center' }}>
                    Which best describes you?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                    {['Student', 'Young professional', 'Business owner / entrepreneur', 'Freelancer', 'Other'].map((label) => {
                      const active = reason === label;
                      return (
                        <Pressable
                          key={label}
                          onPress={() => setReason(label)}
                          style={({ pressed }) => [
                            {
                              paddingHorizontal: 14,
                              paddingVertical: 8,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: active ? theme.colors.primary : theme.colors.border,
                              backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                              opacity: pressed ? 0.9 : 1
                            }
                          ]}
                        >
                          <Text
                            style={{
                              color: active ? tokens.colors.white : theme.colors.text,
                              fontWeight: '700',
                              fontSize: 14
                            }}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={{ color: theme.colors.text, fontWeight: '800', marginTop: 18, marginBottom: 8, fontSize: 15, textAlign: 'center' }}>
                    Why are you trying this app?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                    {['Track spending better', 'Get in control of debt', 'Save towards goals', 'Just exploring'].map((label) => {
                      const active = source === label;
                      return (
                        <Pressable
                          key={label}
                          onPress={() => setSource(label)}
                          style={({ pressed }) => [
                            {
                              paddingHorizontal: 14,
                              paddingVertical: 8,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: active ? theme.colors.primary : theme.colors.border,
                              backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                              opacity: pressed ? 0.9 : 1
                            }
                          ]}
                        >
                          <Text
                            style={{
                              color: active ? tokens.colors.white : theme.colors.text,
                              fontWeight: '700',
                              fontSize: 14
                            }}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={{ color: theme.colors.text, fontWeight: '800', marginTop: 18, marginBottom: 8, fontSize: 15, textAlign: 'center' }}>
                    What are you most interested in?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                    {['Budgeting', 'Goals & savings', 'Insights & analytics', 'Tax & salary view'].map((label) => {
                      const active = interest === label;
                      return (
                        <Pressable
                          key={label}
                          onPress={() => setInterest(label)}
                          style={({ pressed }) => [
                            {
                              paddingHorizontal: 14,
                              paddingVertical: 8,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: active ? theme.colors.primary : theme.colors.border,
                              backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                              opacity: pressed ? 0.9 : 1
                            }
                          ]}
                        >
                          <Text
                            style={{
                              color: active ? tokens.colors.white : theme.colors.text,
                              fontWeight: '700',
                              fontSize: 14
                            }}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </Animated.View>
          </ScrollView>
        </View>

        {/* Footer: dots + primary CTA */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
            {slides.map((_, i) => {
              const active = i === index;
              return (
                <View
                  key={i}
                  style={{
                    width: active ? 24 : 10,
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: active ? theme.colors.primary : theme.colors.border
                  }}
                />
              );
            })}
          </View>

          {!isAuth ? (
            <>
              <PrimaryButton
                title={isLast ? 'Finish' : 'Next'}
                onPress={() => {
                  if (isLast) handleDone();
                  else setIndex((v) => Math.min(v + 1, slides.length - 1));
                }}
              />

              {!isLast ? (
                <Pressable
                  onPress={onDone}
                  style={({ pressed }) => [{
                    paddingVertical: 14,
                    alignItems: 'center',
                    opacity: pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.985 : 1 }]
                  }]}
                >
                  <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>Skip for now</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <View style={{ height: 52 }} />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
